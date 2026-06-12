import type {
  LaunchableStateOptions,
  LaunchCleanup,
  LaunchHandler,
  StateLauncherCommand,
} from './index'

const launchHandlerKey: unique symbol = Symbol('state-launcher launch handler')
const hasLaunchHandlerKey: unique symbol = Symbol('state-launcher has launch handler')
const commandKey: unique symbol = Symbol('state-launcher command')

type DefinedStateLauncherCommand<Id extends string = string> = StateLauncherCommand<Id> & {
  [commandKey]?: true
  [launchHandlerKey]?: LaunchHandler
  [hasLaunchHandlerKey]?: boolean
}

type CommandRegistration = {
  command: StateLauncherCommand
}

export type CommandRecord = {
  command: StateLauncherCommand
  commands: Set<StateLauncherCommand>
  id: string
  label?: string
  description?: string
  tags?: string[]
  registrations: Set<CommandRegistration>
  retainedCommands: Set<StateLauncherCommand>
  attachedHandlers: Set<LaunchHandler>
  launchHandlers: Set<LaunchHandler>
}

export type CommandRecordSnapshot = Readonly<{
  command: StateLauncherCommand
  id: string
  label?: string
  description?: string
  tags: readonly string[]
  hasLaunchHandler: boolean
}>

type CommandRegistry = {
  commandRecords: WeakMap<StateLauncherCommand, CommandRecord>
  commandsById: Map<string, StateLauncherCommand>
  listeners: Set<() => void>
}

let registry: CommandRegistry = createRegistry()
let unregisteredCommands = new WeakSet<StateLauncherCommand>()
let activeCommandId: string | undefined
let activeLaunchCleanups: LaunchCleanup[] = []

/**
 * Define a launchable state command.
 *
 * Command definition is side-effect free; call registerLaunchableState to make
 * commands discoverable by the launcher UI. Empty ids throw.
 */
/* @__NO_SIDE_EFFECTS__ */
export function defineLaunchableState<const Id extends string>(
  id: Id,
  options?: LaunchableStateOptions,
): StateLauncherCommand<Id> {
  if (id.length === 0) {
    throw new Error('State launcher command id must not be empty.')
  }

  const command: DefinedStateLauncherCommand<Id> = {
    [commandKey]: true,
    id,
    label: options?.label,
    description: options?.description,
    tags: options?.tags ? [...options.tags] : undefined,
    async launch() {
      await launchCommand(command)
    },
  }

  if (options && 'launch' in options) {
    command[hasLaunchHandlerKey] = true
    command[launchHandlerKey] = options.launch
  }

  return command
}

/**
 * Register commands so they can be discovered by the launcher UI.
 *
 * The returned cleanup removes only this registration call, which lets HMR
 * dispose an old module instance without tearing down newer duplicate-id
 * registrations or handlers attached from mounted components.
 */
export function registerLaunchableState(commands: readonly StateLauncherCommand[]): () => void {
  const registrations = commands.map((command) => ({ command }))

  for (const registration of registrations) {
    registerCommand(registration.command, registration)
  }

  notifyCommandListeners()

  return once(() => {
    for (const registration of registrations) {
      unregisterRegistration(registration)
    }

    notifyCommandListeners()
  })
}

function unregisterRegistration(registration: CommandRegistration): void {
  const record = registry.commandRecords.get(registration.command)

  if (!record || !record.registrations.delete(registration)) {
    return
  }

  if (
    !hasRegisteredCommand(record, registration.command) &&
    !record.retainedCommands.has(registration.command)
  ) {
    // HMR-disposed handles must not fall back to their factory handler after
    // their registration contribution has been removed.
    record.commands.delete(registration.command)
    registry.commandRecords.delete(registration.command)
    unregisteredCommands.add(registration.command)
  }

  refreshCommandRecord(record)

  if (
    record.registrations.size === 0 &&
    record.attachedHandlers.size === 0 &&
    record.retainedCommands.size === 0
  ) {
    removeCommandRecord(record)
  }
}

function removeCommandRecord(record: CommandRecord): void {
  registry.commandsById.delete(record.id)
  clearActiveCommand(record.id)

  for (const command of record.commands) {
    registry.commandRecords.delete(command)
    unregisteredCommands.add(command)
  }
}

/** Launch a registered command by handle or id. */
export async function launchCommand(commandOrId: StateLauncherCommand | string): Promise<void> {
  const record = resolveCommandRecord(commandOrId, false)
  const id = typeof commandOrId === 'string' ? commandOrId : commandOrId.id
  const launchHandlers = record
    ? [...record.launchHandlers]
    : typeof commandOrId === 'string'
      ? []
      : [getDefinedCommandLaunchHandler(commandOrId)].filter(isLaunchHandler)

  if (launchHandlers.length === 0) {
    throw new Error(`State launcher command "${id}" does not have a launch handler.`)
  }

  await activateCommand(id)

  // Snapshot handlers so continuations attached during this launch replay once
  // through active-state handling instead of being visited by Set iteration too.
  for (const launch of launchHandlers) {
    await runLaunchHandler(launch, id)
  }
}

/** Unregister a command by handle or id. Missing string ids are ignored. */
export function unregisterCommand(commandOrId: StateLauncherCommand | string): void {
  if (typeof commandOrId === 'string') {
    const command = registry.commandsById.get(commandOrId)

    if (command) {
      const record = registry.commandRecords.get(command)
      registry.commandsById.delete(commandOrId)
      clearActiveCommand(commandOrId)

      if (record) {
        for (const command of record.commands) {
          registry.commandRecords.delete(command)
          unregisteredCommands.add(command)
        }
      }

      notifyCommandListeners()
    }

    return
  }

  const record = registry.commandRecords.get(commandOrId)

  if (!record) {
    throw new Error('Invalid state launcher command.')
  }

  registry.commandsById.delete(record.id)
  clearActiveCommand(record.id)
  for (const command of record.commands) {
    registry.commandRecords.delete(command)
    unregisteredCommands.add(command)
  }
  notifyCommandListeners()
}

/** Clear all commands from the process-local registry. Mounted launchers stay subscribed. */
export function clearCommands(): void {
  const { listeners } = registry
  // Mounted launchers stay subscribed across clearCommands() so their panels can
  // render the emptied registry instead of holding stale command snapshots.
  registry = {
    ...createRegistry(),
    listeners,
  }
  activeCommandId = undefined
  activeLaunchCleanups = []
  notifyCommandListeners()
}

export function getCommandRecord(command: StateLauncherCommand): CommandRecord | undefined {
  return registry.commandRecords.get(command)
}

export function listCommandRecords(): CommandRecordSnapshot[] {
  const records: CommandRecordSnapshot[] = []

  for (const command of registry.commandsById.values()) {
    const record = registry.commandRecords.get(command)

    if (record) {
      records.push({
        command: record.command,
        id: record.id,
        label: record.label,
        description: record.description,
        tags: record.tags ?? [],
        hasLaunchHandler: record.launchHandlers.size > 0,
      })
    }
  }

  return records.sort((left, right) => left.id.localeCompare(right.id))
}

export function subscribeCommandRecords(listener: () => void): () => void {
  registry.listeners.add(listener)

  return () => {
    registry.listeners.delete(listener)
  }
}

export function setCommandLaunchHandler(
  command: StateLauncherCommand,
  launch: LaunchHandler,
): () => void {
  const record = registerCommand(command)

  record.retainedCommands.add(command)
  record.attachedHandlers.add(launch)
  refreshCommandRecord(record)
  notifyCommandListeners()

  if (record.id === activeCommandId) {
    // A command can reveal more UI as it launches; newly mounted handlers for
    // the active state continue that launch immediately.
    void runLaunchHandler(launch, record.id)
  }

  return () => {
    if (record.attachedHandlers.delete(launch)) {
      refreshCommandRecord(record)
      notifyCommandListeners()
    }
  }
}

function registerCommand(
  command: StateLauncherCommand,
  registration?: CommandRegistration,
): CommandRecord {
  if (!isDefinedCommand(command)) {
    throw new Error('Invalid state launcher command.')
  }

  unregisteredCommands.delete(command)

  const existingRecord = registry.commandRecords.get(command)

  if (existingRecord) {
    existingRecord.commands.add(command)
    if (registration) {
      existingRecord.registrations.add(registration)
    }
    refreshCommandRecord(existingRecord, command)
    return existingRecord
  }

  const idRecord = registry.commandsById.get(command.id)
  const record = idRecord ? registry.commandRecords.get(idRecord) : undefined

  if (record) {
    registry.commandsById.set(command.id, command)
    record.commands.add(command)
    registry.commandRecords.set(command, record)
    if (registration) {
      record.registrations.add(registration)
    }
    refreshCommandRecord(record, command)
    return record
  }

  const newRecord: CommandRecord = {
    command,
    commands: new Set([command]),
    id: command.id,
    registrations: new Set(registration ? [registration] : []),
    retainedCommands: new Set(),
    attachedHandlers: new Set(),
    launchHandlers: new Set(),
  }
  registry.commandsById.set(command.id, command)
  registry.commandRecords.set(command, newRecord)
  refreshCommandRecord(newRecord, command)
  return newRecord
}

function createRegistry(): CommandRegistry {
  return {
    commandRecords: new WeakMap(),
    commandsById: new Map(),
    listeners: new Set(),
  }
}

function resolveCommandRecord(
  commandOrId: StateLauncherCommand | string,
  requireRegistered = true,
): CommandRecord | undefined {
  if (typeof commandOrId === 'string') {
    const command = registry.commandsById.get(commandOrId)

    if (!command) {
      throw new Error(`Unknown state launcher command "${commandOrId}".`)
    }

    return registry.commandRecords.get(command)!
  }

  const record = registry.commandRecords.get(commandOrId)

  if (
    !record &&
    (requireRegistered || !isDefinedCommand(commandOrId) || unregisteredCommands.has(commandOrId))
  ) {
    throw new Error('Invalid state launcher command.')
  }

  return record
}

function refreshCommandRecord(record: CommandRecord, fallbackCommand = record.command): void {
  // Rebuild from live contributions so HMR cleanup can remove stale module
  // definitions while preserving handlers attached from elsewhere.
  const command = getLatestRegisteredCommand(record) ?? fallbackCommand
  record.command = command
  record.id = command.id
  record.label = command.label
  record.description = command.description
  record.tags = command.tags ? [...command.tags] : undefined

  record.launchHandlers = new Set(record.attachedHandlers)

  for (const registration of record.registrations) {
    const launch = getDefinedCommandLaunchHandler(registration.command)

    if (launch) {
      record.launchHandlers.add(launch)
    }
  }
}

function getLatestRegisteredCommand(record: CommandRecord): StateLauncherCommand | undefined {
  let latestCommand: StateLauncherCommand | undefined

  for (const registration of record.registrations) {
    latestCommand = registration.command
  }

  return latestCommand
}

function hasRegisteredCommand(record: CommandRecord, command: StateLauncherCommand): boolean {
  for (const registration of record.registrations) {
    if (registration.command === command) {
      return true
    }
  }

  return false
}

function getDefinedCommandLaunchHandler(command: StateLauncherCommand): LaunchHandler | undefined {
  const definedCommand = command as DefinedStateLauncherCommand

  if (definedCommand[hasLaunchHandlerKey]) {
    return definedCommand[launchHandlerKey]
  }
}

function isDefinedCommand(command: StateLauncherCommand): boolean {
  return (command as DefinedStateLauncherCommand)[commandKey] === true
}

function isLaunchHandler(launch: LaunchHandler | undefined): launch is LaunchHandler {
  return Boolean(launch)
}

function notifyCommandListeners(): void {
  for (const listener of registry.listeners) {
    listener()
  }
}

function clearActiveCommand(id: string): void {
  if (activeCommandId === id) {
    activeCommandId = undefined
    activeLaunchCleanups = []
  }
}

async function activateCommand(id: string): Promise<void> {
  if (activeCommandId === id) {
    return
  }

  const cleanups = activeLaunchCleanups
  activeCommandId = id
  activeLaunchCleanups = []

  for (const cleanup of cleanups) {
    await cleanup()
  }
}

async function runLaunchHandler(launch: LaunchHandler, id: string): Promise<void> {
  const cleanup = await launch()

  if (!isLaunchCleanup(cleanup)) {
    return
  }

  if (activeCommandId === id) {
    activeLaunchCleanups.push(cleanup)
    return
  }

  await cleanup()
}

function isLaunchCleanup(cleanup: unknown): cleanup is LaunchCleanup {
  return typeof cleanup === 'function'
}

function once(callback: () => void): () => void {
  let called = false

  return () => {
    if (called) {
      return
    }

    called = true
    callback()
  }
}
