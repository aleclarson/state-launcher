import {
  clearCommands,
  defineLaunchableState,
  mountStateLauncher,
  registerLaunchableState,
  type MountedStateLauncher,
} from '../src/index'
import {
  clearActiveState,
  getStateLauncherSnapshot,
  launchStateLauncherCommand,
  subscribeStateLauncher,
  type StateLauncherSnapshot,
} from '../src/headless'

let mountedLauncher: MountedStateLauncher | undefined

afterEach(async () => {
  await clearActiveState()
  mountedLauncher?.unmount()
  mountedLauncher = undefined
  document.body.replaceChildren()
  clearCommands()
})

test('returns a serializable snapshot without command handles or mutable registry data', () => {
  expect(getStateLauncherSnapshot()).toEqual([])

  registerLaunchableState([
    defineLaunchableState('billing.paymentFailed', {
      label: 'Payment failed',
      description: 'Customer has a failed payment method.',
      tags: ['billing', 'card'],
      routes: ['/billing/*'],
      launch() {},
    }),
  ])

  const snapshot = getStateLauncherSnapshot()

  expect(snapshot).toEqual([
    {
      id: 'billing.paymentFailed',
      label: 'Payment failed',
      description: 'Customer has a failed payment method.',
      tags: ['billing', 'card'],
      routes: ['/billing/*'],
      hasLaunchHandler: true,
      isActive: false,
    },
  ])
  expect(snapshot[0]).not.toHaveProperty('command')
  expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot)

  ;(snapshot[0]!.tags as string[]).push('changed outside the registry')
  expect(getStateLauncherSnapshot()[0]?.tags).toEqual(['billing', 'card'])
})

test('subscriptions observe registration, unregistration, and handler availability', () => {
  const snapshots: StateLauncherSnapshot[] = []
  const unsubscribe = subscribeStateLauncher((snapshot) => snapshots.push(snapshot))
  const withoutHandler = defineLaunchableState('catalog.example', { label: 'Example' })
  const registerWithoutHandler = registerLaunchableState([withoutHandler])

  expect(latestCommand(snapshots, 'catalog.example')).toEqual({
    id: 'catalog.example',
    label: 'Example',
    tags: [],
    routes: [],
    hasLaunchHandler: false,
    isActive: false,
  })

  const withHandler = defineLaunchableState('catalog.example', {
    label: 'Updated example',
    launch() {},
  })
  const registerWithHandler = registerLaunchableState([withHandler])

  expect(latestCommand(snapshots, 'catalog.example')).toMatchObject({
    label: 'Updated example',
    hasLaunchHandler: true,
  })

  registerWithHandler()
  expect(latestCommand(snapshots, 'catalog.example')).toMatchObject({
    label: 'Example',
    hasLaunchHandler: false,
  })

  registerWithoutHandler()
  expect(snapshots.at(-1)).toEqual([])

  const snapshotCount = snapshots.length
  unsubscribe()
  registerLaunchableState([defineLaunchableState('catalog.afterUnsubscribe')])
  expect(snapshots).toHaveLength(snapshotCount)
})

test('launches by stable id, reports active state, and clears with abort and cleanup', async () => {
  let signal: AbortSignal | undefined
  const cleanup = vi.fn()
  const command = defineLaunchableState('active.paymentFailed', {
    launch(context) {
      signal = context.signal
      return cleanup
    },
  })
  registerLaunchableState([command])
  const snapshots: StateLauncherSnapshot[] = []
  const unsubscribe = subscribeStateLauncher((snapshot) => snapshots.push(snapshot))

  await launchStateLauncherCommand(command.id)

  expect(latestCommand(snapshots, command.id)).toMatchObject({ isActive: true })
  expect(getStateLauncherSnapshot()).toEqual([
    expect.objectContaining({ id: command.id, isActive: true }),
  ])

  await clearActiveState()

  expect(signal?.aborted).toBe(true)
  expect(cleanup).toHaveBeenCalledOnce()
  expect(latestCommand(snapshots, command.id)).toMatchObject({ isActive: false })
  expect(getStateLauncherSnapshot()).toEqual([
    expect.objectContaining({ id: command.id, isActive: false }),
  ])

  unsubscribe()
})

test('preserves active transition and abort behavior when launching another id', async () => {
  let finishFirstLaunch: (() => void) | undefined
  let firstSignal: AbortSignal | undefined
  const firstCleanup = vi.fn()
  const first = defineLaunchableState('transition.first', {
    async launch(context) {
      firstSignal = context.signal
      await new Promise<void>((resolve) => {
        finishFirstLaunch = resolve
      })
      return firstCleanup
    },
  })
  const second = defineLaunchableState('transition.second', { launch() {} })
  registerLaunchableState([first, second])

  const firstLaunch = launchStateLauncherCommand(first.id)
  await Promise.resolve()
  await launchStateLauncherCommand(second.id)

  expect(firstSignal?.aborted).toBe(true)
  expect(getStateLauncherSnapshot()).toEqual([
    expect.objectContaining({ id: first.id, isActive: false }),
    expect.objectContaining({ id: second.id, isActive: true }),
  ])

  finishFirstLaunch?.()
  await firstLaunch
  expect(firstCleanup).toHaveBeenCalledOnce()
})

test('propagates failed launches and leaves the command inactive', async () => {
  const error = new Error('Headless launch failed.')
  registerLaunchableState([
    defineLaunchableState('failure.example', {
      launch() {
        throw error
      },
    }),
  ])

  await expect(launchStateLauncherCommand('failure.example')).rejects.toBe(error)
  expect(getStateLauncherSnapshot()).toEqual([
    expect.objectContaining({ id: 'failure.example', hasLaunchHandler: true, isActive: false }),
  ])
  await expect(launchStateLauncherCommand('missing.example')).rejects.toThrow(
    'Unknown state launcher command',
  )
})

test('shares the registry and active state with the existing launcher UI', async () => {
  const command = defineLaunchableState('ui.shared', {
    label: 'Shared command',
    launch() {},
  })
  registerLaunchableState([command])
  mountedLauncher = mountStateLauncher({ initiallyOpen: true })
  await nextRender()

  const shadowRoot = getLauncherShadowRoot()
  expect(shadowRoot?.textContent).toContain('Shared command')

  await launchStateLauncherCommand(command.id)
  await nextRender()

  expect(shadowRoot?.querySelector('[aria-current="true"]')?.textContent).toContain(
    'Shared command',
  )
  expect(shadowRoot?.textContent).toContain('Active: Shared command')
})

function latestCommand(snapshots: StateLauncherSnapshot[], id: string) {
  return snapshots.at(-1)?.find((command) => command.id === id)
}

function getLauncherShadowRoot(): ShadowRoot | undefined {
  return (
    document.querySelector<HTMLElement>('[data-state-launcher-host="true"]')?.shadowRoot ??
    undefined
  )
}

async function nextRender(): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(resolve))
}
