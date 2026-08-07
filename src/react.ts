import { useEffect, useRef } from 'react'

import type { LaunchableStateOptions, LaunchHandler, StateLauncherCommand } from './index'
import {
  defineLaunchableState,
  registerCommandLaunchHandler,
  setCommandLaunchHandler,
} from './registry'

/** Options for a command owned and defined by one React component. */
export type UseLaunchableStateOptions = Omit<LaunchableStateOptions, 'launch'> & {
  /** Handler that puts the application into this state. */
  launch: LaunchHandler
}

/**
 * Attach a launch handler for a shared command while a React component is mounted.
 *
 * Define labels, descriptions, and tags with `defineLaunchableState`; this hook
 * owns only the handler lifecycle. The command is discoverable while its handler
 * is attached, and cleanup removes the exact handler installed by this hook.
 */
export function useLaunchableState(command: StateLauncherCommand, handler: LaunchHandler): void

/**
 * Define and attach a component-owned launchable state while it is mounted.
 *
 * The returned command handle is stable across rerenders with the same id and
 * can be launched directly. Metadata initializes when the handle is created;
 * the launch handler always uses the latest render closure.
 */
export function useLaunchableState<const Id extends string>(
  id: Id,
  options: UseLaunchableStateOptions,
): StateLauncherCommand<Id>

export function useLaunchableState(
  commandOrId: StateLauncherCommand | string,
  handlerOrOptions: LaunchHandler | UseLaunchableStateOptions,
): StateLauncherCommand | void {
  const localCommandRef = useRef<StateLauncherCommand | undefined>(undefined)
  const isLocal = typeof commandOrId === 'string'

  if (isLocal && localCommandRef.current?.id !== commandOrId) {
    const { launch: _, ...metadata } = handlerOrOptions as UseLaunchableStateOptions
    localCommandRef.current = defineLaunchableState(commandOrId, metadata)
  }

  const command = isLocal ? localCommandRef.current! : commandOrId
  const handler = isLocal
    ? (handlerOrOptions as UseLaunchableStateOptions).launch
    : (handlerOrOptions as LaunchHandler)
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const attachHandler = isLocal ? registerCommandLaunchHandler : setCommandLaunchHandler
    return attachHandler(command, (context) => handlerRef.current(context))
  }, [command, isLocal])

  return isLocal ? command : undefined
}
