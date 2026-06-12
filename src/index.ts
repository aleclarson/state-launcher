export {
  clearCommands,
  defineLaunchableState,
  launchCommand,
  registerLaunchableState,
  unregisterCommand,
} from './registry'
export { mountStateLauncher } from './launcher'

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

/** Controller returned by `mountStateLauncher`. */
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

/** Stable handle for a launchable application state. */
export type StateLauncherCommand<Id extends string = string> = {
  /** Stable command id, usually a dotted name such as `billing.paymentFailed`. */
  readonly id: Id
  /** Human-readable label shown in the launcher panel. */
  readonly label?: string
  /** Short explanation shown below the label. */
  readonly description?: string
  /** Searchable tags used by the launcher filter. */
  readonly tags?: readonly string[]
  /** Launch this command through its currently registered handlers. */
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
