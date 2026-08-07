export {
  clearActiveState,
  clearCommands,
  defineLaunchableState,
  launchCommand,
  registerLaunchableState,
  unregisterCommand,
} from './registry'
export { mountStateLauncher } from './launcher'

/** Options for mounting the isolated in-page launcher UI. */
export type MountStateLauncherOptions = {
  /** Optional authentication actions exposed to the UI and launch handlers. */
  auth?: StateLauncherAuthOptions
  /** Element that receives the launcher host. Defaults to `document.body`. */
  target?: HTMLElement
  /** Whether the command panel is open immediately after mount. Defaults to `false`. */
  initiallyOpen?: boolean
  /**
   * Desktop corner for the launcher panel. At viewport widths of 1024px and below,
   * the panel becomes a fullscreen bottom drawer regardless of this value. Defaults
   * to `bottom-right`.
   */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  /**
   * Show the current pathname with controls to navigate home or edit the path.
   * Defaults to `false`.
   */
  showPathname?: boolean
  /** Accessible panel title. Defaults to `Commands`. */
  title?: string
}

/** Authentication state and actions exposed by the launcher UI. */
export type StateLauncherAuthOptions = {
  /**
   * Resolve the pathname used by the navigation bar's home button from the
   * launcher's current authentication state. Defaults to `/`.
   */
  homePath?: (context: { isSignedIn: boolean }) => string
  /** Whether the current user is signed in when the launcher is mounted. */
  isSignedIn: boolean
  /** Sign the current user in when an auth action requires it. */
  onSignIn: () => void | Promise<void>
  /** Sign the current user out when an auth action requires it. */
  onSignOut: () => void | Promise<void>
}

/** Controller returned by `mountStateLauncher`. */
export type MountedStateLauncher = {
  /** Remove the launcher UI. Registered commands are left unchanged. */
  unmount(): void
  /** Re-read the current pathname and refresh route-aware command ranking. */
  refresh(): void
  /** Open the launcher panel. */
  open(): void
  /** Close the launcher panel. */
  close(): void
  /** Toggle the launcher panel. */
  toggle(): void
}

/** Pathname pattern used to boost a command on matching routes. */
export type StateLauncherRoutePattern = string

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
  /** Pathname patterns that boost this command on matching routes. */
  readonly routes?: readonly StateLauncherRoutePattern[]
  /** Launch this command through its currently registered handlers. */
  launch(): Promise<void>
}

/** Serializable record describing one registered command. */
export type StateLauncherCommandSnapshot = Readonly<{
  /** Stable command id. */
  id: string
  /** Human-readable label, when one was provided. */
  label?: string
  /** Short explanation, when one was provided. */
  description?: string
  /** Searchable tags. */
  tags: readonly string[]
  /** Pathname patterns used for route-aware UI ranking. */
  routes: readonly StateLauncherRoutePattern[]
  /** Whether at least one launch handler is currently available. */
  hasLaunchHandler: boolean
  /** Whether this command is the committed active state. */
  isActive: boolean
}>

/** Current serializable catalog of registered commands. */
export type StateLauncherSnapshot = readonly StateLauncherCommandSnapshot[]

/** Receives a fresh command catalog after the registry changes. */
export type StateLauncherSnapshotListener = (snapshot: StateLauncherSnapshot) => void

/** Cleanup registered or returned by a launch handler while its state is active. */
export type LaunchCleanup = () => void | Promise<void>

/** Per-handler context for one active launch. */
export type LaunchContext = {
  /** Aborted when a different command launch begins or the active command is cleared. */
  readonly signal: AbortSignal
  /**
   * Register cleanup as setup resources are acquired. Deferred cleanups run in
   * reverse registration order. Cleanup registered after abort starts immediately.
   */
  defer(cleanup: LaunchCleanup): void
  /**
   * Sign in through the mounted launcher's auth callbacks when currently signed
   * out. Rejects when launcher authentication is not configured.
   */
  signIn(): Promise<void>
  /**
   * Sign out through the mounted launcher's auth callbacks when currently signed
   * in. Rejects when launcher authentication is not configured.
   */
  signOut(): Promise<void>
}

/** Handler that puts the host application into a launchable state. */
export type LaunchHandler = (
  context: LaunchContext,
) => void | LaunchCleanup | Promise<void | LaunchCleanup>

/** Metadata and optional behavior for a launchable state command. */
export type LaunchableStateOptions = {
  /** Human-readable label shown in the launcher panel. */
  label?: string
  /** Short explanation shown below the label. */
  description?: string
  /** Searchable tags used by the launcher filter. */
  tags?: string[]
  /** Pathname patterns that boost this command on matching routes. */
  routes?: readonly StateLauncherRoutePattern[]
  /** Handler that puts the host application into this state. */
  launch?: LaunchHandler
}
