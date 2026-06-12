import type { LaunchableStateOptions, StateLauncherCommand } from './index'

export type CommandRecord = {
  id: string
  label?: string
  description?: string
  tags?: string[]
  launch?: () => void | Promise<void>
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

/**
 * Define or update a launchable state command.
 *
 * Reusing an existing id returns the same command object and updates its
 * metadata and launch handler. Empty ids throw.
 */
export function defineLaunchableState<const Id extends string>(
  id: Id,
  options?: LaunchableStateOptions,
): StateLauncherCommand<Id> {
  if (id.length === 0) {
    throw new Error('State launcher command id must not be empty.')
  }

  let command = registry.commandsById.get(id) as StateLauncherCommand<Id> | undefined
  let record: CommandRecord | undefined

  if (command) {
    record = registry.commandRecords.get(command)
    if (!record) {
      throw new Error(`State launcher command "${id}" has an invalid registry record.`)
    }
  } else {
    const newCommand: StateLauncherCommand<Id> = {
      id,
      async launch() {
        await launchCommand(newCommand)
      },
    }
    command = newCommand
    record = { id }
    registry.commandsById.set(id, command)
    registry.commandRecords.set(command, record)
  }

  if (options) {
    applyOptions(record, options)
  }

  notifyCommandListeners()
  return command
}

/** Launch a registered command by handle or id. */
export async function launchCommand(commandOrId: StateLauncherCommand | string): Promise<void> {
  const record = resolveCommandRecord(commandOrId)

  if (!record.launch) {
    throw new Error(`State launcher command "${record.id}" does not have a launch handler.`)
  }

  await record.launch()
}

/** Unregister a command by handle or id. Missing string ids are ignored. */
export function unregisterCommand(commandOrId: StateLauncherCommand | string): void {
  if (typeof commandOrId === 'string') {
    const command = registry.commandsById.get(commandOrId)

    if (command) {
      registry.commandsById.delete(commandOrId)
      registry.commandRecords.delete(command)
      notifyCommandListeners()
    }

    return
  }

  const record = registry.commandRecords.get(commandOrId)

  if (!record) {
    throw new Error('Invalid state launcher command.')
  }

  registry.commandsById.delete(record.id)
  registry.commandRecords.delete(commandOrId)
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
        command,
        id: record.id,
        label: record.label,
        description: record.description,
        tags: record.tags ?? [],
        hasLaunchHandler: Boolean(record.launch),
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
  launch: () => void | Promise<void>,
): () => void {
  const record = registry.commandRecords.get(command)

  if (!record) {
    throw new Error('Invalid state launcher command.')
  }

  record.launch = launch
  notifyCommandListeners()

  return () => {
    // Hook cleanups must not remove a handler that was replaced after mount.
    if (record.launch === launch) {
      delete record.launch
      notifyCommandListeners()
    }
  }
}

function createRegistry(): CommandRegistry {
  return {
    commandRecords: new WeakMap(),
    commandsById: new Map(),
    listeners: new Set(),
  }
}

function resolveCommandRecord(commandOrId: StateLauncherCommand | string): CommandRecord {
  if (typeof commandOrId === 'string') {
    const command = registry.commandsById.get(commandOrId)

    if (!command) {
      throw new Error(`Unknown state launcher command "${commandOrId}".`)
    }

    return registry.commandRecords.get(command)!
  }

  const record = registry.commandRecords.get(commandOrId)

  if (!record) {
    throw new Error('Invalid state launcher command.')
  }

  return record
}

function applyOptions(record: CommandRecord, options: LaunchableStateOptions): void {
  record.label = options.label
  record.description = options.description
  record.tags = options.tags ? [...options.tags] : undefined
  record.launch = options.launch
}

function notifyCommandListeners(): void {
  for (const listener of registry.listeners) {
    listener()
  }
}
