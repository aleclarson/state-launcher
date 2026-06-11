import { useEffect } from 'preact/hooks'

import type { StateLauncherCommand } from './index'
import { setCommandLaunchHandler } from './registry'

export function useLaunchableState(
  command: StateLauncherCommand,
  handler: () => void | Promise<void>,
): void {
  useEffect(() => setCommandLaunchHandler(command, handler), [command, handler])
}
