export type MountStateLauncherOptions = {
  target?: HTMLElement
  initiallyOpen?: boolean
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  title?: string
}

export type MountedStateLauncher = {
  unmount(): void
  open(): void
  close(): void
  toggle(): void
}

export type StateLauncherCommand<Id extends string = string> = {
  readonly id: Id
  launch(): Promise<void>
}

export type LaunchableStateOptions = {
  label?: string
  description?: string
  tags?: string[]
  launch?: () => void | Promise<void>
}

export function mountStateLauncher(_options: MountStateLauncherOptions = {}): MountedStateLauncher {
  throw new Error('mountStateLauncher is not implemented yet.')
}

export function defineLaunchableState<const Id extends string>(
  id: Id,
  _options: LaunchableStateOptions = {},
): StateLauncherCommand<Id> {
  return {
    id,
    async launch() {
      throw new Error('defineLaunchableState launch handlers are not implemented yet.')
    },
  }
}

export async function launchCommand(_command: StateLauncherCommand | string): Promise<void> {
  throw new Error('launchCommand is not implemented yet.')
}

export function unregisterCommand(_command: StateLauncherCommand | string): void {}

export function clearCommands(): void {}
