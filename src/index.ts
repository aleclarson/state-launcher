import {
  clearCommandRegistry,
  defineCommand,
  launchRegisteredCommand,
  unregisterRegisteredCommand,
} from './registry'
import { mountLauncher } from './launcher'

/** Options for mounting the isolated in-page launcher UI. */
export type MountStateLauncherOptions = {
  /** Element that receives the launcher host. Defaults to `document.body`. */
  target?: HTMLElement
  /** Whether the command panel is open immediately after mount. Defaults to `false`. */
  initiallyOpen?: boolean
  /** Floating position for the launcher button and panel. Defaults to `bottom-right`. */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  /** Accessible panel title. Defaults to `Commands`. */
  title?: string
}

/** Controller returned by {@link mountStateLauncher}. */
export type MountedStateLauncher = {
  /** Remove the launcher UI. Registered commands are left unchanged. */
  unmount(): void
  /** Open the launcher panel. */
  open(): void
  /** Close the launcher panel. */
  close(): void
  /** Toggle the launcher panel. */
  toggle(): void
}

/** Stable handle for a launchable state registered in the process-local registry. */
export type StateLauncherCommand<Id extends string = string> = {
  /** Stable command id, usually a dotted name such as `billing.paymentFailed`. */
  readonly id: Id
  /** Launch this command through its currently registered handler. */
  launch(): Promise<void>
}

/** Metadata and optional behavior for a launchable state command. */
export type LaunchableStateOptions = {
  /** Human-readable label shown in the launcher panel. */
  label?: string
  /** Short explanation shown below the label. */
  description?: string
  /** Searchable tags used by the launcher filter. */
  tags?: string[]
  /** Handler that puts the host application into this state. */
  launch?: () => void | Promise<void>
}

/**
 * Mount the Shadow DOM-isolated launcher UI.
 *
 * The mounted UI subscribes to registry changes and can launch any registered
 * command with a handler. Unmounting removes only the UI, not the command
 * registry.
 */
export function mountStateLauncher(options: MountStateLauncherOptions = {}): MountedStateLauncher {
  return mountLauncher(options)
}

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
  return defineCommand(id, options)
}

/** Launch a registered command by handle or id. */
export async function launchCommand(command: StateLauncherCommand | string): Promise<void> {
  await launchRegisteredCommand(command)
}

/** Unregister a command by handle or id. Missing string ids are ignored. */
export function unregisterCommand(command: StateLauncherCommand | string): void {
  unregisterRegisteredCommand(command)
}

/** Clear all commands from the process-local registry. Mounted launchers stay subscribed. */
export function clearCommands(): void {
  clearCommandRegistry()
}
