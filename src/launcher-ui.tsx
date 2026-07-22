/// <reference path="./css.d.ts" />

import { useSearchNavigation } from '@goddard-ai/ui-primitives'
import { useSignal, type Signal } from '@preact/signals'
import { searchFields, segments, type FieldMatch, type MatchRange } from 'fuzzysort2'
import type { TargetedFocusEvent, TargetedPointerEvent } from 'preact'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'

import type { MountStateLauncherOptions } from './index'
import styles from './launcher.module.css'
import {
  clearActiveState,
  launchCommand,
  listCommandRecords,
  subscribeCommandRecords,
  type CommandRecordSnapshot,
} from './registry'

const launchHistoryStorageKey = 'state-launcher.launch-history.v1'
const launchHistoryWindowMs = 24 * 60 * 60 * 1000
const recentCommandLimit = 3
const mobileViewportQuery = '(max-width: 1024px)'
const swipeDismissDistance = 56

export type LauncherProps = {
  auth?: MountStateLauncherOptions['auth']
  isOpen: Signal<boolean>
  position: NonNullable<MountStateLauncherOptions['position']>
  title: string
}

type LaunchCounts = ReadonlyMap<string, number>
type LaunchHistory = Record<string, number[]>
type CommandSearchView = {
  commands: CommandRecordSnapshot[]
  matches: ReadonlyMap<string, readonly FieldMatch[]>
}

export function LauncherShell({ auth, isOpen, position, title }: LauncherProps) {
  const [commands, setCommands] = useState(() => listCommandRecords())
  const commandsRef = useRef(commands)
  const [launchError, setLaunchError] = useState<string>()
  const [pendingCommandId, setPendingCommandId] = useState<string>()
  const [isAuthPending, setIsAuthPending] = useState(false)
  const [isClearPending, setIsClearPending] = useState(false)
  const [isSignedIn, setIsSignedIn] = useState(true)
  const isClearPendingRef = useRef(false)
  const launcherRef = useRef<HTMLDivElement | null>(null)
  const pendingCommandIdRef = useRef<string>()
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const hasOpenedRef = useRef(isOpen.value)
  const swipeStartRef = useRef<{ pointerId: number; x: number; y: number }>()
  const isLauncherOpen = isOpen.value
  const panelState = isLauncherOpen ? 'open' : hasOpenedRef.current ? 'closed' : 'idle'

  if (isLauncherOpen) {
    hasOpenedRef.current = true
  }
  const visibleCommands = useSignal(commands)
  const commandMatches = useSignal<ReadonlyMap<string, readonly FieldMatch[]>>(new Map())
  const recentCommandIds = useSignal<string[]>([])
  const currentVisibleCommands = visibleCommands.value
  const currentCommandMatches = commandMatches.value
  const currentRecentCommandIds = recentCommandIds.value
  const groupedCommands = groupCommands(currentVisibleCommands, currentRecentCommandIds)
  const activeCommand = commands.find((command) => command.isActive)
  const isCommandInteractionPending = Boolean(pendingCommandId) || isClearPending

  function readSearchQuery() {
    return searchInputRef.current?.value ?? ''
  }

  function refreshVisibleCommands(nextCommands = commands, query = readSearchQuery()) {
    const searchView = filterAndRankCommands(nextCommands, query)
    visibleCommands.value = searchView.commands
    commandMatches.value = searchView.matches
    recentCommandIds.value = query.trim() ? [] : readRecentCommandIds(Date.now(), nextCommands)
  }

  async function toggleAuthentication() {
    if (!auth || isAuthPending) {
      return
    }

    setIsAuthPending(true)

    try {
      await (isSignedIn ? auth.onSignOut() : auth.onSignIn())
      setIsSignedIn(!isSignedIn)
      setLaunchError(undefined)
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsAuthPending(false)
    }
  }

  async function activateCommand(command: CommandRecordSnapshot, preserveSearch = false) {
    if (pendingCommandIdRef.current || isClearPendingRef.current) {
      return
    }

    pendingCommandIdRef.current = command.id
    setPendingCommandId(command.id)
    setLaunchError(undefined)

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
      isOpen.value = false
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : String(error))
    } finally {
      pendingCommandIdRef.current = undefined
      setPendingCommandId(undefined)
    }
  }

  async function clearCurrentState() {
    if (pendingCommandIdRef.current || isClearPendingRef.current) {
      return
    }

    isClearPendingRef.current = true
    setIsClearPending(true)
    setLaunchError(undefined)

    try {
      await clearActiveState()
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : String(error))
    } finally {
      isClearPendingRef.current = false
      setIsClearPending(false)
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
    onEscape() {
      isOpen.value = false
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
    // Applying pending state can move focus when a control becomes unavailable.
    // Keep the panel visible until the in-flight operation settles.
    if (pendingCommandIdRef.current || isClearPendingRef.current) {
      return
    }

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

  useEffect(() => {
    const refreshCommands = () => {
      const nextCommands = listCommandRecords()

      if (haveMatchingCommandSnapshots(commandsRef.current, nextCommands)) {
        return
      }

      commandsRef.current = nextCommands
      setCommands(nextCommands)
      refreshVisibleCommands(nextCommands)
      searchNavigation.resetActiveIndex()
    }
    const unsubscribe = subscribeCommandRecords(refreshCommands)

    // Commands registered after the initial render but before this effect ran
    // would otherwise be missed until the registry changed again.
    refreshCommands()
    return unsubscribe
  }, [searchNavigation])

  useLayoutEffect(() => {
    if (isLauncherOpen) {
      refreshVisibleCommands(commands)
      searchInputRef.current?.focus()
    } else if (!isLauncherOpen && searchInputRef.current) {
      const searchRoot = searchInputRef.current.getRootNode()

      if (
        hasOpenedRef.current &&
        window.matchMedia(mobileViewportQuery).matches &&
        (searchRoot instanceof Document || searchRoot instanceof ShadowRoot) &&
        searchRoot.activeElement === searchInputRef.current
      ) {
        searchInputRef.current.blur()
      }
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
            <div class={styles.titleBar}>
              <h2>{title}</h2>
              <div class={styles.titleBarActions}>
                {auth ? (
                  <button
                    aria-label={isSignedIn ? 'Sign out' : 'Sign in'}
                    class={styles.titleBarButton}
                    disabled={isAuthPending}
                    onClick={() => {
                      void toggleAuthentication()
                    }}
                    onPointerDown={(event) => {
                      event.stopPropagation()
                    }}
                    type="button"
                  >
                    {isSignedIn ? <SignOutIcon /> : <SignInIcon />}
                  </button>
                ) : null}
                <button
                  aria-label="Refresh page"
                  class={styles.titleBarButton}
                  onClick={() => {
                    window.location.reload()
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                  }}
                  type="button"
                >
                  <RefreshIcon />
                </button>
              </div>
            </div>
          </header>
          <input
            aria-label="Filter commands"
            class={styles.searchInput}
            placeholder="Filter commands"
            ref={registerSearchInput}
            type="search"
          />
          <div aria-live="polite" aria-atomic="true" class={styles.visuallyHidden} role="status">
            {pendingCommandId
              ? `Launching ${commands.find((command) => command.id === pendingCommandId)?.label ?? pendingCommandId}…`
              : isClearPending
                ? 'Clearing active state…'
                : ''}
          </div>
          {activeCommand ? (
            <div class={styles.activeState}>
              <span class={styles.activeStateLabel}>
                <span aria-hidden="true" class={styles.activeStateDot} />
                Active: {activeCommand.label ?? activeCommand.id}
              </span>
              <button
                class={styles.clearActiveState}
                disabled={isCommandInteractionPending}
                onClick={() => {
                  void clearCurrentState()
                }}
                type="button"
              >
                {isClearPending ? 'Clearing…' : 'Clear'}
              </button>
            </div>
          ) : null}
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
                      const matches = currentCommandMatches.get(command.id) ?? []
                      const labelMatch = findFieldMatch(matches, command.label ? 'label' : 'id')
                      const descriptionMatch = findFieldMatch(matches, 'description')
                      const idMatch = findFieldMatch(matches, 'id')
                      const matchedTags = getMatchedTags(
                        command.tags,
                        findFieldMatch(matches, 'tags'),
                      )
                      const isActive = command.isActive
                      const isPending = pendingCommandId === command.id
                      let className = styles.command

                      if (!command.hasLaunchHandler) {
                        className += ` ${styles.disabled}`
                      }
                      if (isPending) {
                        className += ` ${styles.pending}`
                      }
                      if (isActive) {
                        className += ` ${styles.active}`
                      }

                      return (
                        <button
                          aria-current={isActive || undefined}
                          aria-disabled={isCommandInteractionPending || !command.hasLaunchHandler}
                          aria-busy={isPending || undefined}
                          class={className}
                          disabled={
                            (isCommandInteractionPending && !isPending) || !command.hasLaunchHandler
                          }
                          key={command.id}
                          onClick={() => {
                            void activateCommand(command)
                          }}
                          ref={searchNavigation.itemRef(index)}
                          role="option"
                          type="button"
                        >
                          <span class={styles.commandHeading}>
                            <span class={styles.commandLabel} data-command-label="">
                              {renderMatchedText(command.label ?? command.id, labelMatch)}
                            </span>
                            <span class={styles.commandIndicators}>
                              {isActive ? <span class={styles.activeBadge}>Active</span> : null}
                              {isPending ? (
                                <span aria-hidden="true" class={styles.spinner} />
                              ) : null}
                            </span>
                          </span>
                          {command.description ? (
                            <span class={styles.commandDescription} data-command-description="">
                              {renderMatchedText(command.description, descriptionMatch)}
                            </span>
                          ) : null}
                          {matchedTags.length > 0 ? (
                            <span class={styles.commandTags}>
                              {matchedTags.map((tag, tagIndex) => (
                                <span
                                  class={styles.commandTag}
                                  data-command-tag=""
                                  key={`${tag.target}:${tagIndex}`}
                                >
                                  {renderMatchedText(tag.target, tag)}
                                </span>
                              ))}
                            </span>
                          ) : null}
                          <span class={styles.commandId} data-command-id="">
                            {renderMatchedText(command.id, idMatch)}
                          </span>
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

function RefreshIcon() {
  return (
    // Icon from MingCute Icon by MingCute Design: https://github.com/Richard9394/MingCute/blob/main/LICENSE
    <svg
      aria-hidden="true"
      class={styles.titleBarIcon}
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path d="m12.594 23.258l-.012.002l-.071.035l-.02.004l-.014-.004l-.071-.036q-.016-.004-.024.006l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.016-.018m.264-.113l-.014.002l-.184.093l-.01.01l-.003.011l.018.43l.005.012l.008.008l.201.092q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.003-.011l.018-.43l-.003-.012l-.01-.01z" />
      <path
        fill="currentColor"
        d="M20 9a1 1 0 0 1 1 1v1a8 8 0 0 1-8 8H9.414l.793.793a1 1 0 0 1-1.414 1.414l-2.496-2.496a1 1 0 0 1-.287-.567L6 17.991a1 1 0 0 1 .237-.638l.056-.06l2.5-2.5a1 1 0 0 1 1.414 1.414L9.414 17H13a6 6 0 0 0 6-6v-1a1 1 0 0 1 1-1m-4.793-6.207l2.5 2.5a1 1 0 0 1 0 1.414l-2.5 2.5a1 1 0 1 1-1.414-1.414L14.586 7H11a6 6 0 0 0-6 6v1a1 1 0 1 1-2 0v-1a8 8 0 0 1 8-8h3.586l-.793-.793a1 1 0 0 1 1.414-1.414"
      />
    </svg>
  )
}

function SignOutIcon() {
  return (
    // Icon from MingCute Icon by MingCute Design: https://github.com/Richard9394/MingCute/blob/main/LICENSE
    <svg
      aria-hidden="true"
      class={styles.titleBarIcon}
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path d="m12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.018-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z" />
      <path
        fill="currentColor"
        d="M11.5 3a1 1 0 0 1 .117 1.993L11.5 5H6v14h10v-6.5a1 1 0 0 1 1.993-.117L18 12.5V19h2a1 1 0 0 1 .117 1.993L20 21H4a1 1 0 0 1-.117-1.993L4 19V5a2 2 0 0 1 1.85-1.995L6 3zm2 8a1.5 1.5 0 1 1 0 3a1.5 1.5 0 0 1 0-3m5.087-6.828l2.12 2.12a1 1 0 0 1 0 1.413l-2.12 2.123a1 1 0 0 1-1.415-1.413l.416-.417H14.38a1 1 0 1 1 0-2h3.205l-.412-.412a1 1 0 0 1 1.414-1.414"
      />
    </svg>
  )
}

function SignInIcon() {
  return (
    // Icon from MingCute Icon by MingCute Design: https://github.com/Richard9394/MingCute/blob/main/LICENSE
    <svg
      aria-hidden="true"
      class={styles.titleBarIcon}
      fill="none"
      fill-rule="evenodd"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path d="m12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.018-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z" />
      <path
        fill="currentColor"
        d="M11.852 5.782a4.5 4.5 0 1 1 1.388 7.31a2.1 2.1 0 0 0-.837-.178H11.04c-.69 0-1.25.56-1.25 1.25v1.578H8.213c-.69 0-1.25.56-1.25 1.25v1.578H4.72v-1.414l5.356-5.355c.544-.544.68-1.296.55-1.931a4.5 4.5 0 0 1 1.226-4.088m7.778-1.414A6.5 6.5 0 0 0 8.666 10.27a.2.2 0 0 1-.006.118l-5.5 5.5a1.5 1.5 0 0 0-.44 1.061v2.611c0 .558.452 1.01 1.01 1.01h3.983c.69 0 1.25-.56 1.25-1.25v-1.578h1.578c.69 0 1.25-.56 1.25-1.25v-1.578h.61q.003-.002.042.013a6.502 6.502 0 0 0 7.187-10.56Zm-4.95 4.95a1.5 1.5 0 1 0 2.122-2.122a1.5 1.5 0 0 0-2.122 2.121Z"
      />
    </svg>
  )
}

type HighlightableText = {
  target: string
  ranges: readonly MatchRange[]
}

function findFieldMatch(matches: readonly FieldMatch[], key: string): FieldMatch | undefined {
  return matches.find((match) => match.key === key)
}

function renderMatchedText(text: string, match: HighlightableText | undefined) {
  if (!match) {
    return text
  }

  return segments(match).map((segment, index) =>
    segment.matched ? (
      <mark class={styles.match} key={index}>
        {segment.text}
      </mark>
    ) : (
      <span key={index}>{segment.text}</span>
    ),
  )
}

function getMatchedTags(
  tags: readonly string[],
  match: FieldMatch | undefined,
): HighlightableText[] {
  if (!match) {
    return []
  }

  const matchedTags: HighlightableText[] = []
  let tagOffset = 0

  for (const tag of tags) {
    const tagEnd = tagOffset + tag.length
    const ranges = match.ranges.flatMap((range) => {
      const start = Math.max(range.start, tagOffset)
      const end = Math.min(range.end, tagEnd)

      return start < end ? [{ start: start - tagOffset, end: end - tagOffset }] : []
    })

    if (ranges.length > 0) {
      matchedTags.push({ target: tag, ranges })
    }
    tagOffset = tagEnd + 1
  }

  return matchedTags
}

function haveMatchingCommandSnapshots(
  currentCommands: readonly CommandRecordSnapshot[],
  nextCommands: readonly CommandRecordSnapshot[],
): boolean {
  return (
    currentCommands.length === nextCommands.length &&
    currentCommands.every(
      (command, index) =>
        command.command === nextCommands[index]?.command &&
        command.hasLaunchHandler === nextCommands[index]?.hasLaunchHandler &&
        command.isActive === nextCommands[index]?.isActive,
    )
  )
}

function filterAndRankCommands(
  commands: CommandRecordSnapshot[],
  query: string,
): CommandSearchView {
  const now = Date.now()
  const launchHistory = readLaunchHistory(now)
  const launchCounts = createLaunchCounts(launchHistory)
  const trimmedQuery = query.trim()

  if (!trimmedQuery) {
    return {
      commands: rankRecentCommands(
        rankCommands(commands, launchCounts, true),
        readRecentCommandIds(now, commands, launchHistory),
      ),
      matches: new Map(),
    }
  }

  const searchResult = searchFields(trimmedQuery, commands, [
    { key: 'id', extract: (command) => command.id },
    { key: 'label', extract: (command) => command.label },
    { key: 'description', extract: (command) => command.description },
    { key: 'tags', extract: (command) => command.tags.join(' ') },
  ])

  return {
    commands: rankCommands(
      searchResult.items.map((item) => item.value),
      launchCounts,
    ),
    matches: new Map(searchResult.items.map((item) => [item.value.id, item.fields])),
  }
}

function rankRecentCommands(
  commands: CommandRecordSnapshot[],
  recentCommandIds: readonly string[],
): CommandRecordSnapshot[] {
  const recentRanks = new Map(recentCommandIds.map((id, index) => [id, index]))

  return [...commands].sort((left, right) => {
    const leftRank = recentRanks.get(left.id)
    const rightRank = recentRanks.get(right.id)

    if (leftRank !== undefined && rightRank !== undefined) {
      return leftRank - rightRank
    }
    if (leftRank !== undefined) {
      return -1
    }
    if (rightRank !== undefined) {
      return 1
    }
    return 0
  })
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

function readRecentCommandIds(
  now: number,
  commands: readonly CommandRecordSnapshot[],
  history = readLaunchHistory(now),
): string[] {
  const commandIds = new Set(commands.map((command) => command.id))

  return Object.entries(history)
    .filter(([id]) => commandIds.has(id))
    .sort(([, leftTimestamps], [, rightTimestamps]) => {
      return (
        rightTimestamps[rightTimestamps.length - 1]! - leftTimestamps[leftTimestamps.length - 1]!
      )
    })
    .slice(0, recentCommandLimit)
    .map(([id]) => id)
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

function groupCommands(commands: CommandRecordSnapshot[], recentCommandIds: readonly string[]) {
  const groups = new Map<string, { command: CommandRecordSnapshot; index: number }[]>()
  const recentCommands = new Set(recentCommandIds)

  for (const [index, command] of commands.entries()) {
    const groupName = recentCommands.has(command.id)
      ? 'Recent'
      : command.id.includes('.')
        ? command.id.split('.')[0]!
        : 'ungrouped'
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
