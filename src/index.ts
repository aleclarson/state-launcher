import {
  clearCommandRegistry,
  defineCommand,
  launchRegisteredCommand,
  unregisterRegisteredCommand,
} from './registry'

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
  options?: LaunchableStateOptions,
): StateLauncherCommand<Id> {
  return defineCommand(id, options)
}

export async function launchCommand(command: StateLauncherCommand | string): Promise<void> {
  await launchRegisteredCommand(command)
}

export function unregisterCommand(command: StateLauncherCommand | string): void {
  unregisterRegisteredCommand(command)
}

export function clearCommands(): void {
  clearCommandRegistry()
}
