/// <reference path="./css.d.ts" />

import { signal } from '@preact/signals'
import { createIsolet } from 'isolet-js/runtime'
import { preact } from 'isolet-js/preact'
import launcherCss from './launcher.module.css?inline'
import type { MountedStateLauncher, MountStateLauncherOptions } from './index'
import { LauncherShell, type LauncherProps } from './launcher-ui'

const defaultTitle = 'Commands'
const defaultPosition = 'bottom-right'

/**
 * Mount the Shadow DOM-isolated launcher panel UI.
 *
 * The mounted UI subscribes to registry changes and can launch any registered
 * command with a handler. Unmounting removes only the UI, not the command
 * registry.
 */
export function mountStateLauncher(options: MountStateLauncherOptions = {}): MountedStateLauncher {
  validateAuthOptions(options.auth)

  const target = options.target ?? document.body
  const position = options.position ?? defaultPosition
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
  const props = {
    auth: options.auth,
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
    title: options.title ?? defaultTitle,
  }
  let mounted = true

  launcherIsolet.mount(target, props)

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
      launcherIsolet.unmount()
    },
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
