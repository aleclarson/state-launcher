import { useEffect } from 'preact/hooks'

import type { LaunchHandler, StateLauncherCommand } from './index'
import { setCommandLaunchHandler } from './registry'

/**
 * Attach a launch handler for a command while a Preact component is mounted.
 *
 * Define labels, descriptions, and tags with `defineLaunchableState`; this hook
 * owns only the handler lifecycle. Cleanup removes the exact handler installed
 * by this hook, so newer handlers are not accidentally removed.
 */
export function useLaunchableState(command: StateLauncherCommand, handler: LaunchHandler): void {
  useEffect(() => setCommandLaunchHandler(command, handler), [command, handler])
}
