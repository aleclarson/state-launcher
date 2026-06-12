import { signal, type Signal } from '@preact/signals'
import { searchFields } from 'fuzzysort2'
import { createIsolet } from 'isolet-js/runtime'
import { preact } from 'isolet-js/preact'
import { h } from 'preact'
import { useEffect, useMemo, useState } from 'preact/hooks'

import type { MountedStateLauncher, MountStateLauncherOptions } from './index'
import {
  launchRegisteredCommand,
  listCommandRecords,
  subscribeCommandRecords,
  type CommandRecordSnapshot,
} from './registry'

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
      // Controller methods run outside Preact's event path, so the isolet needs
      // an explicit update to keep the Shadow DOM render in sync.
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
  const [commands, setCommands] = useState(() => listCommandRecords())
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [launchError, setLaunchError] = useState<string>()
  const filteredCommands = useMemo(() => filterCommands(commands, query), [commands, query])
  const groupedCommands = useMemo(() => groupCommands(filteredCommands), [filteredCommands])
  const enabledCommands = useMemo(
    () => filteredCommands.filter((command) => command.hasLaunchHandler),
    [filteredCommands],
  )
  const selectedCommand =
    enabledCommands.length === 0
      ? undefined
      : enabledCommands[Math.min(activeIndex, enabledCommands.length - 1)]

  useEffect(
    () =>
      subscribeCommandRecords(() => {
        setCommands(listCommandRecords())
        setActiveIndex(0)
      }),
    [],
  )

  async function activateCommand(command: CommandRecordSnapshot) {
    try {
      await launchRegisteredCommand(command.command)
      setLaunchError(undefined)
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : String(error))
    }
  }

  function onSearchInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    setQuery(input.value)
    setActiveIndex(0)
    setLaunchError(undefined)
  }

  function onSearchKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => wrapIndex(index + 1, enabledCommands.length))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => wrapIndex(index - 1, enabledCommands.length))
      return
    }

    if (event.key === 'Enter' && selectedCommand) {
      event.preventDefault()
      void activateCommand(selectedCommand)
    }
  }

  return h(
    'div',
    {
      class: `stateLauncher ${position}`,
      'data-position': position,
      'data-state-launcher': '',
    },
    h(
      'button',
      {
        'aria-expanded': String(isOpen.value),
        'aria-label': isOpen.value ? 'Close state launcher' : 'Open state launcher',
        class: 'button',
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
            class: 'panel',
            role: 'dialog',
          },
          h('header', { class: 'header' }, h('h2', {}, title)),
          h('input', {
            'aria-label': 'Filter commands',
            class: 'search',
            onInput: onSearchInput,
            onKeyDown: onSearchKeyDown,
            placeholder: 'Filter commands',
            type: 'search',
            value: query,
          }),
          launchError
            ? h(
                'div',
                {
                  class: 'error',
                  role: 'alert',
                },
                launchError,
              )
            : null,
          filteredCommands.length === 0
            ? h(
                'div',
                { class: 'empty' },
                commands.length === 0 ? 'No commands registered.' : 'No commands match.',
              )
            : h(
                'div',
                { class: 'groups', role: 'listbox' },
                groupedCommands.map((group) =>
                  h(
                    'section',
                    {
                      class: 'group',
                      key: group.name,
                    },
                    h('h3', { class: 'groupTitle' }, group.name),
                    h(
                      'div',
                      { class: 'items' },
                      group.commands.map((command) => {
                        const isActive = command === selectedCommand

                        return h(
                          'button',
                          {
                            'aria-disabled': String(!command.hasLaunchHandler),
                            'aria-selected': String(isActive),
                            class: command.hasLaunchHandler
                              ? isActive
                                ? 'command active'
                                : 'command'
                              : 'command disabled',
                            disabled: !command.hasLaunchHandler,
                            key: command.id,
                            onClick() {
                              void activateCommand(command)
                            },
                            role: 'option',
                            type: 'button',
                          },
                          h(
                            'span',
                            { class: 'commandLabel' },
                            command.label ?? command.id,
                          ),
                          command.description
                            ? h(
                                'span',
                                { class: 'commandDescription' },
                                command.description,
                              )
                            : null,
                          h('span', { class: 'commandId' }, command.id),
                        )
                      }),
                    ),
                  ),
                ),
              ),
        )
      : null,
  )
}

function filterCommands(commands: CommandRecordSnapshot[], query: string): CommandRecordSnapshot[] {
  const trimmedQuery = query.trim()

  if (!trimmedQuery) {
    return rankCommands(commands, true)
  }

  return rankCommands(
    searchFields(trimmedQuery, commands, [
      { key: 'id', extract: (command) => command.id },
      { key: 'label', extract: (command) => command.label },
      { key: 'description', extract: (command) => command.description },
      { key: 'tags', extract: (command) => command.tags.join(' ') },
    ]).items.map((item) => item.value),
  )
}

function rankCommands(
  commands: CommandRecordSnapshot[],
  sortWithinLaunchability = false,
): CommandRecordSnapshot[] {
  return [...commands].sort((left, right) => {
    if (left.hasLaunchHandler !== right.hasLaunchHandler) {
      return left.hasLaunchHandler ? -1 : 1
    }

    return sortWithinLaunchability ? left.id.localeCompare(right.id) : 0
  })
}

function groupCommands(commands: CommandRecordSnapshot[]) {
  const groups = new Map<string, CommandRecordSnapshot[]>()

  for (const command of commands) {
    const groupName = command.id.includes('.') ? command.id.split('.')[0]! : 'ungrouped'
    const group = groups.get(groupName)

    if (group) {
      group.push(command)
    } else {
      groups.set(groupName, [command])
    }
  }

  return [...groups.entries()].map(([name, groupCommands]) => ({
    name,
    commands: groupCommands,
  }))
}

function wrapIndex(index: number, length: number): number {
  if (length === 0) {
    return 0
  }

  return (index + length) % length
}
