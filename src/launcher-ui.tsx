/// <reference path="./css.d.ts" />

import { useSearchNavigation } from '@goddard-ai/ui-primitives'
import { useSignal, type Signal } from '@preact/signals'
import { searchFields } from 'fuzzysort2'
import type { TargetedFocusEvent } from 'preact'
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'

import type { MountStateLauncherOptions } from './index'
import styles from './launcher.module.css'
import {
  launchCommand,
  listCommandRecords,
  subscribeCommandRecords,
  type CommandRecordSnapshot,
} from './registry'

const launchHistoryStorageKey = 'state-launcher.launch-history.v1'
const launchHistoryWindowMs = 24 * 60 * 60 * 1000

export type LauncherProps = {
  isOpen: Signal<boolean>
  position: NonNullable<MountStateLauncherOptions['position']>
  title: string
}

type LaunchCounts = ReadonlyMap<string, number>
type LaunchHistory = Record<string, number[]>

export function LauncherShell({ isOpen, position, title }: LauncherProps) {
  const [commands, setCommands] = useState(() => listCommandRecords())
  const [launchCounts, setLaunchCounts] = useState(() => readLaunchCounts(Date.now()))
  const [launchError, setLaunchError] = useState<string>()
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const filteredCommands = useSignal(filterCommands(commands, '', launchCounts))
  const currentFilteredCommands = filteredCommands.value
  const groupedCommands = useMemo(
    () => groupCommands(currentFilteredCommands),
    [currentFilteredCommands],
  )

  function updateFilteredCommands(
    nextCommands = commands,
    nextLaunchCounts = launchCounts,
    query = searchInputRef.current?.value ?? '',
  ) {
    filteredCommands.value = filterCommands(nextCommands, query, nextLaunchCounts)
  }

  async function activateCommand(command: CommandRecordSnapshot) {
    try {
      await launchCommand(command.command)
      const nextLaunchCounts = recordLaunch(command.id, Date.now())
      setLaunchCounts(nextLaunchCounts)
      if (searchInputRef.current) {
        searchInputRef.current.value = ''
      }
      updateFilteredCommands(commands, nextLaunchCounts, '')
      searchNavigation.resetActiveIndex()
      setLaunchError(undefined)
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : String(error))
    }
  }

  const searchNavigation = useSearchNavigation({
    activeAttribute: 'aria-selected',
    count: () => filteredCommands.value.length,
    onActivate(index) {
      const command = filteredCommands.value[index]

      if (command?.hasLaunchHandler) {
        void activateCommand(command)
      }
    },
    onQueryChange(nextQuery) {
      const nextLaunchCounts = readLaunchCounts(Date.now())
      setLaunchCounts(nextLaunchCounts)
      updateFilteredCommands(commands, nextLaunchCounts, nextQuery)
      setLaunchError(undefined)
    },
  })

  const focusSearchInput = useCallback(
    (input: HTMLInputElement | null) => {
      searchInputRef.current = input
      const cleanup = searchNavigation.inputRef(input)
      input?.focus()

      return () => {
        if (searchInputRef.current === input) {
          searchInputRef.current = null
        }
        cleanup?.()
      }
    },
    [searchNavigation],
  )
  const hideWhenFocusLeaves = useCallback(
    (event: TargetedFocusEvent<HTMLElement>) => {
      const nextFocusedElement = event.relatedTarget

      if (nextFocusedElement instanceof Node && event.currentTarget.contains(nextFocusedElement)) {
        return
      }

      isOpen.value = false
    },
    [isOpen],
  )

  useEffect(
    () =>
      subscribeCommandRecords(() => {
        const nextCommands = listCommandRecords()
        const nextLaunchCounts = readLaunchCounts(Date.now())
        setCommands(nextCommands)
        setLaunchCounts(nextLaunchCounts)
        updateFilteredCommands(nextCommands, nextLaunchCounts)
        searchNavigation.resetActiveIndex()
      }),
    [searchNavigation],
  )

  return (
    <div
      class={`${styles.stateLauncher} ${styles[position]}`}
      data-position={position}
      data-state-launcher=""
    >
      {isOpen.value ? (
        <section
          aria-label={title}
          class={styles.panel}
          onFocusOut={hideWhenFocusLeaves}
          role="dialog"
        >
          <header class={styles.header}>
            <h2>{title}</h2>
          </header>
          <input
            aria-label="Filter commands"
            class={styles.searchInput}
            placeholder="Filter commands"
            ref={focusSearchInput}
            type="search"
          />
          {launchError ? (
            <div class={styles.error} role="alert">
              {launchError}
            </div>
          ) : null}
          {currentFilteredCommands.length === 0 ? (
            <div class={styles.empty}>
              {commands.length === 0 ? 'No commands registered.' : 'No commands match.'}
            </div>
          ) : (
            <div class={styles.groups} role="listbox">
              {groupedCommands.map((group) => (
                <section class={styles.group} key={group.name}>
                  <h3 class={styles.groupTitle}>{group.name}</h3>
                  <div class={styles.items}>
                    {group.commands.map(({ command, index }) => {
                      const className = command.hasLaunchHandler
                        ? styles.command
                        : `${styles.command} ${styles.disabled}`

                      return (
                        <button
                          aria-disabled={!command.hasLaunchHandler}
                          class={className}
                          disabled={!command.hasLaunchHandler}
                          key={command.id}
                          onClick={() => {
                            void activateCommand(command)
                          }}
                          ref={searchNavigation.itemRef(index)}
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

function filterCommands(
  commands: CommandRecordSnapshot[],
  query: string,
  launchCounts: LaunchCounts,
): CommandRecordSnapshot[] {
  const trimmedQuery = query.trim()

  if (!trimmedQuery) {
    return rankCommands(commands, launchCounts, true)
  }

  return rankCommands(
    searchFields(trimmedQuery, commands, [
      { key: 'id', extract: (command) => command.id },
      { key: 'label', extract: (command) => command.label },
      { key: 'description', extract: (command) => command.description },
      { key: 'tags', extract: (command) => command.tags.join(' ') },
    ]).items.map((item) => item.value),
    launchCounts,
  )
}

function rankCommands(
  commands: CommandRecordSnapshot[],
  launchCounts: LaunchCounts,
  sortWithinLaunchability = false,
): CommandRecordSnapshot[] {
  return [...commands].sort((left, right) => {
    if (left.hasLaunchHandler !== right.hasLaunchHandler) {
      return left.hasLaunchHandler ? -1 : 1
    }

    const launchCountDelta = (launchCounts.get(right.id) ?? 0) - (launchCounts.get(left.id) ?? 0)

    if (launchCountDelta !== 0) {
      return launchCountDelta
    }

    return sortWithinLaunchability ? left.id.localeCompare(right.id) : 0
  })
}

function recordLaunch(commandId: string, now: number): LaunchCounts {
  const history = readLaunchHistory(now)
  const timestamps = history[commandId] ?? []
  history[commandId] = [...timestamps, now]

  writeLaunchHistory(history)

  return createLaunchCounts(history)
}

function readLaunchCounts(now: number): LaunchCounts {
  return createLaunchCounts(readLaunchHistory(now))
}

function readLaunchHistory(now: number): LaunchHistory {
  const minTimestamp = now - launchHistoryWindowMs
  const storage = getLaunchHistoryStorage()
  let storedHistory: unknown

  if (!storage) {
    return createLaunchHistory()
  }

  try {
    storedHistory = JSON.parse(storage.getItem(launchHistoryStorageKey) ?? '{}')
  } catch {
    return createLaunchHistory()
  }

  if (!storedHistory || typeof storedHistory !== 'object' || Array.isArray(storedHistory)) {
    return createLaunchHistory()
  }

  const history = createLaunchHistory()

  for (const [id, timestamps] of Object.entries(storedHistory)) {
    if (!Array.isArray(timestamps)) {
      continue
    }

    const recentTimestamps = timestamps.filter(
      (timestamp): timestamp is number =>
        typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp >= minTimestamp,
    )

    if (recentTimestamps.length > 0) {
      history[id] = recentTimestamps
    }
  }

  writeLaunchHistory(history)

  return history
}

function createLaunchHistory(): LaunchHistory {
  return Object.create(null) as LaunchHistory
}

function writeLaunchHistory(history: LaunchHistory): void {
  const storage = getLaunchHistoryStorage()

  if (!storage) {
    return
  }

  try {
    storage.setItem(launchHistoryStorageKey, JSON.stringify(history))
  } catch {
    // Launch frequency is only a ranking hint; storage failures should not block launches.
  }
}

function getLaunchHistoryStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function createLaunchCounts(history: LaunchHistory): LaunchCounts {
  return new Map(Object.entries(history).map(([id, timestamps]) => [id, timestamps.length]))
}

function groupCommands(commands: CommandRecordSnapshot[]) {
  const groups = new Map<string, { command: CommandRecordSnapshot; index: number }[]>()

  for (const [index, command] of commands.entries()) {
    const groupName = command.id.includes('.') ? command.id.split('.')[0]! : 'ungrouped'
    const group = groups.get(groupName)
    const item = { command, index }

    if (group) {
      group.push(item)
    } else {
      groups.set(groupName, [item])
    }
  }

  return [...groups.entries()].map(([name, groupCommands]) => ({
    name,
    commands: groupCommands,
  }))
}
