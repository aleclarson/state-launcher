import {
  clearCommands,
  defineLaunchableState,
  launchCommand,
  mountStateLauncher,
  registerLaunchableState,
  unregisterCommand,
  type LaunchContext,
  type LaunchCleanup,
  type LaunchHandler,
  type LaunchableStateOptions,
  type MountedStateLauncher,
  type MountStateLauncherOptions,
  type StateLauncherCommand,
} from '../src/index'
import { useLaunchableState } from '../src/preact'

test('exports the package surface', () => {
  expect(typeof clearCommands).toBe('function')
  expect(typeof defineLaunchableState).toBe('function')
  expect(typeof launchCommand).toBe('function')
  expect(typeof mountStateLauncher).toBe('function')
  expect(typeof registerLaunchableState).toBe('function')
  expect(typeof unregisterCommand).toBe('function')
  expect(typeof useLaunchableState).toBe('function')
})

type _PublicTypes = [
  LaunchContext,
  LaunchCleanup,
  LaunchHandler,
  LaunchableStateOptions,
  MountedStateLauncher,
  MountStateLauncherOptions,
  StateLauncherCommand,
]
