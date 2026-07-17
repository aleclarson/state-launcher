/// <reference path="./css.d.ts" />

import { useSearchNavigation } from '@goddard-ai/ui-primitives'
import { useSignal, type Signal } from '@preact/signals'
import { searchFields } from 'fuzzysort2'
import type { TargetedFocusEvent, TargetedPointerEvent } from 'preact'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'

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
const mobileViewportQuery = '(max-width: 1024px)'
const swipeDismissDistance = 56

export type LauncherProps = {
  isOpen: Signal<boolean>
  position: NonNullable<MountStateLauncherOptions['position']>
  title: string
}

type LaunchCounts = ReadonlyMap<string, number>
type LaunchHistory = Record<string, number[]>

export function LauncherShell({ isOpen, position, title }: LauncherProps) {
  const [commands, setCommands] = useState(() => listCommandRecords())
  const [launchError, setLaunchError] = useState<string>()
  const launcherRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const hasOpenedRef = useRef(isOpen.value)
  const swipeStartRef = useRef<{ pointerId: number; x: number; y: number }>()
  const isLauncherOpen = isOpen.value
  const panelState = isLauncherOpen ? 'open' : hasOpenedRef.current ? 'closed' : 'idle'

  if (isLauncherOpen) {
    hasOpenedRef.current = true
  }
  const visibleCommands = useSignal(commands)
  const currentVisibleCommands = visibleCommands.value
  const groupedCommands = groupCommands(currentVisibleCommands)

  function readSearchQuery() {
    return searchInputRef.current?.value ?? ''
  }

  function refreshVisibleCommands(nextCommands = commands, query = readSearchQuery()) {
    visibleCommands.value = filterAndRankCommands(nextCommands, query)
  }

  async function activateCommand(command: CommandRecordSnapshot, preserveSearch = false) {
    try {
      if (preserveSearch) {
        searchInputRef.current?.blur()
      }

      await launchCommand(command.command)
      recordLaunch(command.id, Date.now())
      if (!preserveSearch && searchInputRef.current) {
        searchInputRef.current.value = ''
      }
      refreshVisibleCommands(commands, preserveSearch ? readSearchQuery() : '')
      searchNavigation.resetActiveIndex()
      setLaunchError(undefined)
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : String(error))
    }
  }

  const searchNavigation = useSearchNavigation({
    activeAttribute: 'aria-selected',
    count: () => visibleCommands.value.length,
    onActivate(index) {
      const command = visibleCommands.value[index]

      if (command?.hasLaunchHandler) {
        void activateCommand(command, true)
      }
    },
    onQueryChange(nextQuery) {
      refreshVisibleCommands(commands, nextQuery)
      setLaunchError(undefined)
    },
  })

  const registerSearchInput = useCallback(
    (input: HTMLInputElement | null) => {
      searchInputRef.current = input
      const cleanup = searchNavigation.inputRef(input)

      return () => {
        if (searchInputRef.current === input) {
          searchInputRef.current = null
        }
        cleanup?.()
      }
    },
    [searchNavigation],
  )

  function hideWhenFocusLeaves(event: TargetedFocusEvent<HTMLElement>) {
    // Mobile drawers have explicit dismissal controls, and closing on blur can
    // remove a tapped command before iOS dispatches its click.
    if (window.matchMedia(mobileViewportQuery).matches) {
      return
    }

    const nextFocusedElement = event.relatedTarget

    if (nextFocusedElement instanceof Node && event.currentTarget.contains(nextFocusedElement)) {
      return
    }

    isOpen.value = false
  }

  function startSwipe(event: TargetedPointerEvent<HTMLElement>) {
    if (event.isPrimary) {
      event.currentTarget.setPointerCapture(event.pointerId)
    }

    swipeStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    }
  }

  function updateSwipe(event: TargetedPointerEvent<HTMLElement>) {
    const swipeStart = swipeStartRef.current

    if (!swipeStart || swipeStart.pointerId !== event.pointerId) {
      return
    }

    const horizontalDistance = Math.abs(event.clientX - swipeStart.x)
    const verticalDistance = event.clientY - swipeStart.y

    if (verticalDistance < swipeDismissDistance || verticalDistance <= horizontalDistance) {
      return
    }

    swipeStartRef.current = undefined
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    isOpen.value = false
  }

  function stopSwipe(event: TargetedPointerEvent<HTMLElement>) {
    if (swipeStartRef.current?.pointerId === event.pointerId) {
      swipeStartRef.current = undefined
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  useEffect(
    () =>
      subscribeCommandRecords(() => {
        const nextCommands = listCommandRecords()
        setCommands(nextCommands)
        refreshVisibleCommands(nextCommands)
        searchNavigation.resetActiveIndex()
      }),
    [searchNavigation],
  )

  useLayoutEffect(() => {
    if (isLauncherOpen) {
      refreshVisibleCommands(commands)
      searchInputRef.current?.focus()
    } else if (!isLauncherOpen && searchInputRef.current) {
      searchInputRef.current.value = ''
      refreshVisibleCommands(commands, '')
      searchNavigation.resetActiveIndex()
    }
  }, [isLauncherOpen])

  useEffect(() => {
    const launcher = launcherRef.current
    const viewport = window.visualViewport

    if (!launcher || !viewport) {
      return
    }

    // iOS does not resize dynamic viewport units for its keyboard, but it does
    // report the remaining usable area through VisualViewport.
    const syncVisibleViewport = () => {
      launcher.style.setProperty('--state-launcher-visible-height', `${viewport.height}px`)
      launcher.style.setProperty('--state-launcher-visible-top', `${viewport.offsetTop}px`)
    }

    syncVisibleViewport()
    viewport.addEventListener('resize', syncVisibleViewport)
    viewport.addEventListener('scroll', syncVisibleViewport)

    return () => {
      viewport.removeEventListener('resize', syncVisibleViewport)
      viewport.removeEventListener('scroll', syncVisibleViewport)
    }
  }, [])

  return (
    <div
      class={`${styles.stateLauncher} ${styles[position]}`}
      data-position={position}
      data-state-launcher=""
      ref={launcherRef}
    >
      <>
        {isLauncherOpen ? (
          <button
            aria-label="Close launcher"
            class={styles.dismissArea}
            onClick={() => {
              isOpen.value = false
            }}
            tabIndex={-1}
            type="button"
          />
        ) : null}
        <section
          aria-hidden={!isLauncherOpen}
          aria-label={title}
          class={styles.panel}
          data-state={panelState}
          onFocusOut={hideWhenFocusLeaves}
          role={isLauncherOpen ? 'dialog' : undefined}
        >
          <header
            class={styles.header}
            onPointerCancel={stopSwipe}
            onPointerDown={startSwipe}
            onPointerMove={updateSwipe}
            onPointerUp={stopSwipe}
          >
            <span aria-hidden="true" class={styles.dragHandle} />
            <h2>{title}</h2>
          </header>
          <input
            aria-label="Filter commands"
            class={styles.searchInput}
            placeholder="Filter commands"
            ref={registerSearchInput}
            type="search"
          />
          {launchError ? (
            <div class={styles.error} role="alert">
              {launchError}
            </div>
          ) : null}
          {currentVisibleCommands.length === 0 ? (
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
      </>
    </div>
  )
}

function filterAndRankCommands(
  commands: CommandRecordSnapshot[],
  query: string,
): CommandRecordSnapshot[] {
  const launchCounts = readLaunchCounts(Date.now())
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

function recordLaunch(commandId: string, now: number): void {
  const history = readLaunchHistory(now)
  const timestamps = history[commandId] ?? []
  history[commandId] = [...timestamps, now]

  writeLaunchHistory(history)
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
