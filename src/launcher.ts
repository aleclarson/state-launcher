import { signal, type Signal } from '@preact/signals'
import { createIsolet } from 'isolet-js/runtime'
import { preact } from 'isolet-js/preact'
import { h } from 'preact'

import type { MountedStateLauncher, MountStateLauncherOptions } from './index'

type LauncherProps = {
  isOpen: Signal<boolean>
  setOpen(isOpen: boolean): void
  position: NonNullable<MountStateLauncherOptions['position']>
  title: string
}

const defaultTitle = 'Commands'
const defaultPosition = 'bottom-right'

export function mountLauncher(options: MountStateLauncherOptions = {}): MountedStateLauncher {
  const target = options.target ?? document.body
  const launcherIsolet = createIsolet<LauncherProps>({
    name: 'state-launcher',
    mount: preact(LauncherShell),
    styles: './launcher.module.css',
    hostAttributes: {
      'data-state-launcher-host': 'true',
    },
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
      launcherIsolet.update(props)
    },
    position: options.position ?? defaultPosition,
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

function LauncherShell({ isOpen, position, setOpen, title }: LauncherProps) {
  return h(
    'div',
    {
      class: `stateLauncher stateLauncher--${position}`,
      'data-position': position,
      'data-state-launcher': '',
    },
    h(
      'button',
      {
        'aria-expanded': String(isOpen.value),
        'aria-label': isOpen.value ? 'Close state launcher' : 'Open state launcher',
        class: 'stateLauncher__button',
        onClick() {
          setOpen(!isOpen.value)
        },
        type: 'button',
      },
      'Commands',
    ),
    isOpen.value
      ? h(
          'section',
          {
            'aria-label': title,
            class: 'stateLauncher__panel',
            role: 'dialog',
          },
          h('header', { class: 'stateLauncher__header' }, h('h2', {}, title)),
          h('div', { class: 'stateLauncher__empty' }, 'No commands registered.'),
        )
      : null,
  )
}
