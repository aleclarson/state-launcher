import type { StateLauncherCommand } from './index'

export function useLaunchableState(
  _command: StateLauncherCommand,
  _handler: () => void | Promise<void>,
): void {}
