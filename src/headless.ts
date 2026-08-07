import {
  clearActiveState,
  getStateLauncherSnapshot,
  launchCommand,
  subscribeStateLauncher,
} from './registry'
import type {
  StateLauncherCommandSnapshot,
  StateLauncherSnapshot,
  StateLauncherSnapshotListener,
} from './index'

export { clearActiveState, getStateLauncherSnapshot, subscribeStateLauncher }
export type { StateLauncherCommandSnapshot, StateLauncherSnapshot, StateLauncherSnapshotListener }

/**
 * Launch a registered command by its stable id without mounting the launcher UI.
 * The returned promise settles with the same setup, cleanup, abort, and launch
 * errors as the browser launcher and `launchCommand`.
 */
export function launchStateLauncherCommand(id: string): Promise<void> {
  return launchCommand(id)
}
