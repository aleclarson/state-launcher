/// <reference path="./css.d.ts" />

import type { Signal } from '@preact/signals'
import { searchFields } from 'fuzzysort2'
import { useEffect, useMemo, useState } from 'preact/hooks'

import type { MountStateLauncherOptions } from './index'
import styles from './launcher.module.css'
import {
  launchCommand,
  listCommandRecords,
  subscribeCommandRecords,
  type CommandRecordSnapshot,
} from './registry'

export type LauncherProps = {
  isOpen: Signal<boolean>
  setOpen(isOpen: boolean): void
  position: NonNullable<MountStateLauncherOptions['position']>
  title: string
}

export function LauncherShell({ isOpen, position, setOpen, title }: LauncherProps) {
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
      await launchCommand(command.command)
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

  return (
    <div
      class={`${styles.stateLauncher} ${styles[position]}`}
      data-position={position}
      data-state-launcher=""
    >
      <button
        aria-expanded={isOpen.value}
        aria-label={isOpen.value ? 'Close state launcher' : 'Open state launcher'}
        class={styles.button}
        onClick={() => setOpen(!isOpen.value)}
        type="button"
      >
        Commands
      </button>
      {isOpen.value ? (
        <section aria-label={title} class={styles.panel} role="dialog">
          <header class={styles.header}>
            <h2>{title}</h2>
          </header>
          <input
            aria-label="Filter commands"
            class={styles.searchInput}
            onInput={onSearchInput}
            onKeyDown={onSearchKeyDown}
            placeholder="Filter commands"
            type="search"
            value={query}
          />
          {launchError ? (
            <div class={styles.error} role="alert">
              {launchError}
            </div>
          ) : null}
          {filteredCommands.length === 0 ? (
            <div class={styles.empty}>
              {commands.length === 0 ? 'No commands registered.' : 'No commands match.'}
            </div>
          ) : (
            <div class={styles.groups} role="listbox">
              {groupedCommands.map((group) => (
                <section class={styles.group} key={group.name}>
                  <h3 class={styles.groupTitle}>{group.name}</h3>
                  <div class={styles.items}>
                    {group.commands.map((command) => {
                      const isActive = command === selectedCommand
                      const className = command.hasLaunchHandler
                        ? isActive
                          ? `${styles.command} ${styles.active}`
                          : styles.command
                        : `${styles.command} ${styles.disabled}`

                      return (
                        <button
                          aria-disabled={!command.hasLaunchHandler}
                          aria-selected={isActive}
                          class={className}
                          disabled={!command.hasLaunchHandler}
                          key={command.id}
                          onClick={() => {
                            void activateCommand(command)
                          }}
                          role="option"
                          type="button"
                        >
                          <span class={styles.commandLabel}>{command.label ?? command.id}</span>
                          {command.description ? (
                            <span class={styles.commandDescription}>{command.description}</span>
                          ) : null}
                          <span class={styles.commandId}>{command.id}</span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
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
