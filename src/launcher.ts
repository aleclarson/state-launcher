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
  const target = options.target ?? document.body
  const position = options.position ?? defaultPosition
  const launcherIsolet = createIsolet<LauncherProps>({
    name: 'state-launcher',
    css: launcherCss,
    mount: preact(LauncherShell),
    hostAttributes: {
      'data-state-launcher-host': 'true',
    },
    hostStyles: getHostStyles(position),
    zIndex: 2147483647,
  })
  const isOpen = signal(Boolean(options.initiallyOpen))
  const props = {
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

function getHostStyles(
  position: NonNullable<MountStateLauncherOptions['position']>,
): Partial<CSSStyleDeclaration> {
  switch (position) {
    case 'bottom-left':
      return {
        bottom: '24px',
        left: '24px',
        position: 'fixed',
      }
    case 'top-left':
      return {
        left: '24px',
        position: 'fixed',
        top: '24px',
      }
    case 'top-right':
      return {
        position: 'fixed',
        right: '24px',
        top: '24px',
      }
    case 'bottom-right':
      return {
        bottom: '24px',
        position: 'fixed',
        right: '24px',
      }
  }
}
