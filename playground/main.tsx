import { render } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'

import {
  defineLaunchableState,
  mountStateLauncher,
  registerLaunchableState,
  type MountedStateLauncher,
  type MountStateLauncherOptions,
} from '../src/index'
import './styles.css'

type ScenarioEventDetail = {
  description: string
  name: string
}

type Position = NonNullable<MountStateLauncherOptions['position']>

const positions: Position[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left']

const scenarioEventName = 'state-launcher-playground:scenario'

const emitScenario = (detail: ScenarioEventDetail) => {
  window.dispatchEvent(new CustomEvent<ScenarioEventDetail>(scenarioEventName, { detail }))
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, ms)

    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeout)
        reject(new DOMException('Launch was aborted.', 'AbortError'))
      },
      { once: true },
    )
  })

const commands = [
  defineLaunchableState('billing.paymentFailed', {
    label: 'Payment failed',
    description: 'Customer has a failed card and open invoice.',
    tags: ['billing', 'card', 'invoice'],
    launch() {
      emitScenario({
        name: 'Payment failed',
        description: 'Billing surface shows a failed payment method and recovery action.',
      })
    },
  }),
  defineLaunchableState('billing.emptyInvoices', {
    label: 'Empty invoices',
    description: 'Customer has no invoice history.',
    tags: ['billing', 'empty'],
    launch() {
      emitScenario({
        name: 'Empty invoices',
        description: 'Billing surface renders the empty state for invoice history.',
      })
    },
  }),
  defineLaunchableState('inbox.manyMessages', {
    label: 'Many messages',
    description: 'Async command with searchable inbox tags.',
    tags: ['inbox', 'async', 'messages'],
    async launch({ signal }) {
      emitScenario({
        name: 'Loading inbox',
        description: 'Async launch handler is preparing a busy inbox state.',
      })
      await sleep(500, signal)
      emitScenario({
        name: 'Many messages',
        description: 'Inbox has unread messages across several priority threads.',
      })
    },
  }),
  defineLaunchableState('playground.slowLaunch', {
    label: 'Slow launch',
    description: 'Waits five seconds so the pending launch spinner can be inspected.',
    tags: ['playground', 'pending', 'spinner', 'slow'],
    async launch({ signal }) {
      emitScenario({
        name: 'Slow launch pending',
        description: 'Keep the launcher open to inspect its pending command treatment.',
      })
      await sleep(5000, signal)
      emitScenario({
        name: 'Slow launch complete',
        description: 'The five-second playground launch completed successfully.',
      })
    },
  }),
  defineLaunchableState('inbox.launchError', {
    label: 'Launch error',
    description: 'Throws to verify launcher error display.',
    tags: ['inbox', 'error'],
    launch() {
      throw new Error('Playground command failed.')
    },
  }),
  defineLaunchableState('account.suspended', {
    label: 'Suspended account',
    description: 'Account access is paused until an admin reviews it.',
    tags: ['account', 'review'],
    launch() {
      emitScenario({
        name: 'Suspended account',
        description: 'Account surface shows suspended access and an admin review notice.',
      })
    },
  }),
  defineLaunchableState('account.readonly', {
    label: 'Read-only account',
    description: 'Registered without a handler to verify disabled rendering.',
    tags: ['account', 'disabled'],
  }),
]

const unregisterCommands = registerLaunchableState(commands)

import.meta.hot?.dispose(unregisterCommands)

function App() {
  const [position, setPosition] = useState<Position>('bottom-right')
  const [isMounted, setIsMounted] = useState(true)
  const [scenario, setScenario] = useState<ScenarioEventDetail>({
    name: 'Ready',
    description: 'Use the floating launcher or controls to test command behavior.',
  })
  const [history, setHistory] = useState<string[]>([])
  const launcherRef = useRef<MountedStateLauncher>()

  useEffect(() => {
    const onScenario = (event: Event) => {
      const { detail } = event as CustomEvent<ScenarioEventDetail>

      setScenario(detail)
      setHistory((entries) =>
        [`${new Date().toLocaleTimeString()} - ${detail.name}`, ...entries].slice(0, 8),
      )
    }

    window.addEventListener(scenarioEventName, onScenario)

    return () => {
      window.removeEventListener(scenarioEventName, onScenario)
    }
  }, [])

  useEffect(() => {
    launcherRef.current?.unmount()
    launcherRef.current = undefined

    if (!isMounted) {
      return
    }

    launcherRef.current = mountStateLauncher({
      initiallyOpen: true,
      position,
      title: 'Playground states',
    })

    return () => {
      launcherRef.current?.unmount()
      launcherRef.current = undefined
    }
  }, [isMounted, position])

  const activePositionLabel = useMemo(() => position.replace('-', ' '), [position])

  return (
    <main class="playground">
      <section class="workspace" aria-label="Launcher playground workspace">
        <div class="workspaceHeader">
          <div>
            <p class="eyebrow">state-launcher</p>
            <h1>Launcher UI Playground</h1>
          </div>
          <div class="statusPill">
            {isMounted ? `Mounted: ${activePositionLabel}` : 'Unmounted'}
          </div>
        </div>

        <div class="surface">
          <section class="controls" aria-label="Launcher controls">
            <div class="controlGroup">
              <span class="controlLabel">Panel</span>
              <button type="button" onClick={() => launcherRef.current?.open()}>
                Open
              </button>
              <button type="button" onClick={() => launcherRef.current?.close()}>
                Close
              </button>
              <button type="button" onClick={() => launcherRef.current?.toggle()}>
                Toggle
              </button>
              <label class="mountToggle">
                <input
                  checked={isMounted}
                  onChange={(event) =>
                    setIsMounted((event.currentTarget as HTMLInputElement).checked)
                  }
                  type="checkbox"
                />
                Mounted
              </label>
            </div>

            <div class="controlGroup">
              <span class="controlLabel">Position</span>
              <div class="segmented">
                {positions.map((nextPosition) => (
                  <button
                    aria-pressed={position === nextPosition}
                    class={position === nextPosition ? 'selected' : undefined}
                    key={nextPosition}
                    onClick={() => setPosition(nextPosition)}
                    type="button"
                  >
                    {nextPosition.replace('-', ' ')}
                  </button>
                ))}
              </div>
              <span class="responsiveHint">
                Fullscreen drawer at viewport widths of 1024px and below.
              </span>
            </div>
          </section>

          <section class="preview" aria-live="polite">
            <div>
              <p class="eyebrow">Current state</p>
              <h2>{scenario.name}</h2>
              <p>{scenario.description}</p>
            </div>
            <div class="mockApp" aria-label="Mock app surface">
              <div class="mockNav">
                <span />
                <span />
                <span />
              </div>
              <div class="mockContent">
                <div class="mockTitle">{scenario.name}</div>
                <div class="mockLine wide" />
                <div class="mockLine" />
                <div class="mockLine short" />
              </div>
            </div>
          </section>

          <section class="history" aria-label="Launch history">
            <h2>Launch history</h2>
            {history.length === 0 ? (
              <p>No commands launched yet.</p>
            ) : (
              <ol>
                {history.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </section>
    </main>
  )
}

render(<App />, document.querySelector('#app')!)
