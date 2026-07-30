/// <reference path="./css.d.ts" />

import { signal } from '@preact/signals'
import { createIsolet } from 'isolet-js/runtime'
import { preact } from 'isolet-js/preact'
import launcherCss from './launcher.module.css?inline'
import type { MountedStateLauncher, MountStateLauncherOptions } from './index'
import { registerLauncherAuthActions } from './launcher-auth'
import { LauncherShell, type LauncherAuth, type LauncherProps } from './launcher-ui'

const defaultTitle = 'Commands'
const defaultPosition = 'bottom-right'
let mountedLauncher: object | undefined

/**
 * Mount the Shadow DOM-isolated launcher panel UI.
 *
 * The mounted UI subscribes to registry changes and can launch any registered
 * command with a handler. Unmounting removes only the UI, not the command
 * registry. Only one launcher may be mounted at a time.
 */
export function mountStateLauncher(options: MountStateLauncherOptions = {}): MountedStateLauncher {
  validateAuthOptions(options.auth)

  if (mountedLauncher) {
    throw new Error('A state launcher is already mounted. Unmount it before mounting another.')
  }

  const target = options.target ?? document.body
  const position = options.position ?? defaultPosition
  const auth = createLauncherAuth(options.auth)
  const launcherIsolet = createIsolet<LauncherProps>({
    name: 'state-launcher',
    css: launcherCss,
    mount: preact(LauncherShell),
    hostAttributes: {
      'data-state-launcher-host': 'true',
    },
    hostStyles: getHostStyles(),
    zIndex: 2147483647,
  })
  const isOpen = signal(Boolean(options.initiallyOpen))
  let mounted = true
  const props = {
    auth,
    isOpen,
    setOpen(nextOpen: boolean) {
      if (!mounted) {
        return
      }

      isOpen.value = nextOpen
      // Controller methods run outside Preact's event path, so the isolet needs
      // an explicit update to keep the Shadow DOM render in sync.
      launcherIsolet.update(props)
    },
    position,
    showPathname: options.showPathname ?? false,
    title: options.title ?? defaultTitle,
  }
  const mountToken = {}
  let unregisterLauncherAuth: (() => void) | undefined
  mountedLauncher = mountToken

  try {
    if (auth) {
      unregisterLauncherAuth = registerLauncherAuthActions(auth)
    }
    launcherIsolet.mount(target, props)
  } catch (error) {
    unregisterLauncherAuth?.()
    mountedLauncher = undefined
    throw error
  }

  return {
    open() {
      props.setOpen(true)
    },
    close() {
      props.setOpen(false)
    },
    toggle() {
      props.setOpen(!isOpen.value)
    },
    unmount() {
      if (!mounted) {
        return
      }

      mounted = false
      unregisterLauncherAuth?.()

      try {
        launcherIsolet.unmount()
      } finally {
        if (mountedLauncher === mountToken) {
          mountedLauncher = undefined
        }
      }
    },
  }
}

function createLauncherAuth(auth: MountStateLauncherOptions['auth']): LauncherAuth | undefined {
  if (!auth) {
    return undefined
  }

  const configuredAuth = auth
  const isSignedIn = signal(configuredAuth.isSignedIn)
  let actionQueue = Promise.resolve()

  function setSignedIn(nextIsSignedIn: boolean): Promise<void> {
    const action = actionQueue.then(async () => {
      if (isSignedIn.value === nextIsSignedIn) {
        return
      }

      await (nextIsSignedIn ? configuredAuth.onSignIn() : configuredAuth.onSignOut())
      isSignedIn.value = nextIsSignedIn
    })

    actionQueue = action.catch(() => {})
    return action
  }

  return {
    homePath: configuredAuth.homePath,
    isSignedIn,
    signIn: () => setSignedIn(true),
    signOut: () => setSignedIn(false),
  }
}

function validateAuthOptions(auth: MountStateLauncherOptions['auth']): void {
  if (
    auth !== undefined &&
    (typeof auth?.isSignedIn !== 'boolean' ||
      typeof auth?.onSignIn !== 'function' ||
      typeof auth?.onSignOut !== 'function')
  ) {
    throw new TypeError(
      'State launcher auth.isSignedIn, auth.onSignIn, and auth.onSignOut must be defined together.',
    )
  }
}

function getHostStyles(): Partial<CSSStyleDeclaration> {
  // The panel owns its corner/drawer placement. A zero-sized top-left host avoids
  // both carrying a corner offset through keyboard resizes and blocking app input.
  return {
    height: '0',
    left: '0',
    position: 'fixed',
    top: '0',
    width: '0',
  }
}
