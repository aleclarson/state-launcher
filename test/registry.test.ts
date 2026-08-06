import {
  clearActiveState,
  clearCommands,
  defineLaunchableState,
  launchCommand,
  registerLaunchableState,
  unregisterCommand,
} from '../src/index'
import { getCommandRecord, listCommandRecords, setCommandLaunchHandler } from '../src/registry'

afterEach(() => {
  clearCommands()
})

test('defines commands without registering them', async () => {
  const launch = vi.fn()
  const command = defineLaunchableState('billing.paymentFailed', {
    label: 'Payment failed',
    description: 'Customer has a failed payment method.',
    tags: ['billing'],
    launch,
  })

  expect(command).toMatchObject({
    id: 'billing.paymentFailed',
    label: 'Payment failed',
    description: 'Customer has a failed payment method.',
    tags: ['billing'],
  })
  expect(getCommandRecord(command)).toBeUndefined()
  expect(listCommandRecords()).toEqual([])

  await command.launch()
  expect(launch).toHaveBeenCalledOnce()
})

test('normalizes and exposes route metadata on defined and registered commands', () => {
  const routes = ['/billing/', '/billing/invoices/*']
  const command = defineLaunchableState('billing.paymentFailed', { routes })

  expect(command.routes).toEqual(['/billing', '/billing/invoices/*'])

  routes.push('/settings')
  registerLaunchableState([command])

  expect(listCommandRecords()).toEqual([
    expect.objectContaining({
      command,
      routes: ['/billing', '/billing/invoices/*'],
    }),
  ])
})

test('registers commands and merges duplicate ids', async () => {
  const first = defineLaunchableState('billing.paymentFailed', {
    label: 'Payment failed',
    description: 'Customer has a failed payment method.',
    tags: ['billing'],
  })
  const launch = vi.fn()
  const second = defineLaunchableState('billing.paymentFailed', {
    label: 'Payment failed again',
    launch,
  })

  registerLaunchableState([first, second])

  expect(second).not.toBe(first)
  expect(getCommandRecord(first)).toMatchObject({
    id: 'billing.paymentFailed',
    label: 'Payment failed again',
  })
  expect(getCommandRecord(first)?.launchHandlers).toContain(launch)
  expect(getCommandRecord(second)).toBe(getCommandRecord(first))
  expect(listCommandRecords()).toHaveLength(1)

  await second.launch()
  expect(launch).toHaveBeenCalledOnce()
})

test('registration cleanup removes only its own duplicate-id contribution', async () => {
  const oldLaunch = vi.fn()
  const nextLaunch = vi.fn()
  const oldCommand = defineLaunchableState('billing.paymentFailed', {
    label: 'Old payment failed',
    launch: oldLaunch,
  })
  const nextCommand = defineLaunchableState('billing.paymentFailed', {
    label: 'Next payment failed',
    launch: nextLaunch,
  })

  const cleanupOld = registerLaunchableState([oldCommand])
  registerLaunchableState([nextCommand])
  cleanupOld()
  cleanupOld()

  expect(listCommandRecords()).toEqual([
    expect.objectContaining({
      command: nextCommand,
      id: 'billing.paymentFailed',
      label: 'Next payment failed',
    }),
  ])

  await expect(oldCommand.launch()).rejects.toThrow('Invalid state launcher command')
  await nextCommand.launch()

  expect(oldLaunch).not.toHaveBeenCalled()
  expect(nextLaunch).toHaveBeenCalledOnce()
})

test('registration cleanup preserves attached handlers', async () => {
  const definedLaunch = vi.fn()
  const attachedLaunch = vi.fn()
  const command = defineLaunchableState('billing.paymentFailed', { launch: definedLaunch })
  const cleanup = registerLaunchableState([command])
  setCommandLaunchHandler(command, attachedLaunch)

  cleanup()
  await command.launch()

  expect(definedLaunch).not.toHaveBeenCalled()
  expect(attachedLaunch).toHaveBeenCalledOnce()
})

test('launches commands by object or id', async () => {
  const launch = vi.fn()
  const command = defineLaunchableState('inbox.manyMessages', { launch })
  registerLaunchableState([command])

  await command.launch()
  await launchCommand(command)
  await launchCommand('inbox.manyMessages')

  expect(launch).toHaveBeenCalledTimes(3)
})

test('launches every handler for a command', async () => {
  const definedLaunch = vi.fn()
  const attachedLaunch = vi.fn()
  const duplicateLaunch = vi.fn()
  const command = defineLaunchableState('billing.paymentFailed', { launch: definedLaunch })
  const duplicate = defineLaunchableState('billing.paymentFailed', { launch: duplicateLaunch })

  registerLaunchableState([command, duplicate])
  const detach = setCommandLaunchHandler(command, attachedLaunch)

  await command.launch()
  detach()
  await command.launch()

  expect(definedLaunch).toHaveBeenCalledTimes(2)
  expect(duplicateLaunch).toHaveBeenCalledTimes(2)
  expect(attachedLaunch).toHaveBeenCalledOnce()
})

test('runs launch cleanups when another state is activated', async () => {
  const calls: string[] = []
  const cleanup = vi.fn(() => {
    calls.push('cleanup')
  })
  const firstLaunch = vi.fn(() => cleanup)
  const secondLaunch = vi.fn(() => {
    calls.push('second launch')
  })
  const first = defineLaunchableState('billing.paymentFailed', { launch: firstLaunch })
  const second = defineLaunchableState('inbox.manyMessages', { launch: secondLaunch })
  registerLaunchableState([first, second])

  await first.launch()

  expect(firstLaunch).toHaveBeenCalledOnce()
  expect(cleanup).not.toHaveBeenCalled()

  await second.launch()

  expect(cleanup).toHaveBeenCalledOnce()
  expect(secondLaunch).toHaveBeenCalledOnce()
  expect(calls).toEqual(['cleanup', 'second launch'])
})

test('commits active state only after teardown and setup resolve', async () => {
  let finishCleanup: (() => void) | undefined
  let finishSetup: (() => void) | undefined
  let markSetupStarted: (() => void) | undefined
  const setupStarted = new Promise<void>((resolve) => {
    markSetupStarted = resolve
  })
  const first = defineLaunchableState('billing.paymentFailed', {
    launch() {
      return () =>
        new Promise<void>((resolve) => {
          finishCleanup = resolve
        })
    },
  })
  const second = defineLaunchableState('inbox.manyMessages', {
    launch() {
      markSetupStarted?.()
      return new Promise<void>((resolve) => {
        finishSetup = resolve
      })
    },
  })
  registerLaunchableState([first, second])

  await first.launch()
  const secondLaunch = second.launch()
  await Promise.resolve()

  expect(listCommandRecords()).toEqual([
    expect.objectContaining({ id: 'billing.paymentFailed', isActive: true }),
    expect.objectContaining({ id: 'inbox.manyMessages', isActive: false }),
  ])

  finishCleanup?.()
  await setupStarted

  expect(listCommandRecords()).toEqual([
    expect.objectContaining({ id: 'billing.paymentFailed', isActive: false }),
    expect.objectContaining({ id: 'inbox.manyMessages', isActive: false }),
  ])

  finishSetup?.()
  await secondLaunch

  expect(listCommandRecords()).toEqual([
    expect.objectContaining({ id: 'billing.paymentFailed', isActive: false }),
    expect.objectContaining({ id: 'inbox.manyMessages', isActive: true }),
  ])
})

test('runs deferred cleanups while a launch handler is still pending', async () => {
  const calls: string[] = []
  let finishFirstLaunch: (() => void) | undefined
  const first = defineLaunchableState('billing.paymentFailed', {
    async launch({ defer }) {
      calls.push('first launch')
      defer(() => {
        calls.push('first cleanup')
      })
      await new Promise<void>((resolve) => {
        finishFirstLaunch = resolve
      })
    },
  })
  const second = defineLaunchableState('inbox.manyMessages', {
    launch() {
      calls.push('second launch')
    },
  })
  registerLaunchableState([first, second])

  const firstLaunch = first.launch()
  await Promise.resolve()
  await second.launch()

  expect(calls).toEqual(['first launch', 'first cleanup', 'second launch'])

  finishFirstLaunch?.()
  await firstLaunch
})

test('runs handler cleanups in reverse registration order', async () => {
  const calls: string[] = []
  const command = defineLaunchableState('billing.paymentFailed', {
    launch({ defer }) {
      defer(() => {
        calls.push('first deferred cleanup')
      })
      defer(() => {
        calls.push('second deferred cleanup')
      })
      return () => {
        calls.push('returned cleanup')
      }
    },
  })

  await command.launch()
  await clearActiveState()

  expect(calls).toEqual(['returned cleanup', 'second deferred cleanup', 'first deferred cleanup'])
})

test('cleans partial setup when a launch handler throws', async () => {
  const error = new Error('Host launch failed.')
  const calls: string[] = []
  const command = defineLaunchableState('billing.paymentFailed', {
    launch({ defer }) {
      defer(() => {
        calls.push('first cleanup')
      })
      defer(() => {
        calls.push('second cleanup')
      })
      throw error
    },
  })

  await expect(command.launch()).rejects.toBe(error)

  expect(calls).toEqual(['second cleanup', 'first cleanup'])
})

test('runs cleanup registered after abort immediately and once', async () => {
  let finishSetup: (() => void) | undefined
  const cleanup = vi.fn()
  const first = defineLaunchableState('billing.paymentFailed', {
    async launch({ defer }) {
      await new Promise<void>((resolve) => {
        finishSetup = resolve
      })
      defer(cleanup)
    },
  })
  const second = defineLaunchableState('inbox.manyMessages', { launch: vi.fn() })
  registerLaunchableState([first, second])

  const firstLaunch = first.launch()
  await Promise.resolve()
  await second.launch()

  finishSetup?.()
  await firstLaunch

  expect(cleanup).toHaveBeenCalledOnce()

  await clearActiveState()
  expect(cleanup).toHaveBeenCalledOnce()
})

test('attempts every deferred cleanup and aggregates failures', async () => {
  const firstError = new Error('First cleanup failed.')
  const secondError = new Error('Second cleanup failed.')
  const firstCleanup = vi.fn(() => {
    throw firstError
  })
  const secondCleanup = vi.fn(() => {
    throw secondError
  })
  const command = defineLaunchableState('billing.paymentFailed', {
    launch({ defer }) {
      defer(firstCleanup)
      defer(secondCleanup)
    },
  })

  await command.launch()

  const cleanupResult = clearActiveState()
  await expect(cleanupResult).rejects.toMatchObject({
    errors: [secondError, firstError],
  })
  expect(secondCleanup).toHaveBeenCalledOnce()
  expect(firstCleanup).toHaveBeenCalledOnce()
})

test('aggregates launch and deferred cleanup failures', async () => {
  const launchError = new Error('Host launch failed.')
  const cleanupError = new Error('Host cleanup failed.')
  const command = defineLaunchableState('billing.paymentFailed', {
    launch({ defer }) {
      defer(() => {
        throw cleanupError
      })
      throw launchError
    },
  })

  await expect(command.launch()).rejects.toMatchObject({
    errors: [launchError, cleanupError],
  })
})

test('runs deferred cleanup when an active command is unregistered', async () => {
  const cleanup = vi.fn()
  const command = defineLaunchableState('billing.paymentFailed', {
    launch({ defer }) {
      defer(cleanup)
    },
  })
  registerLaunchableState([command])

  await command.launch()
  unregisterCommand(command)

  expect(cleanup).toHaveBeenCalledOnce()
})

test('runs deferred cleanup when the registry is cleared', async () => {
  const cleanup = vi.fn()
  const command = defineLaunchableState('billing.paymentFailed', {
    launch({ defer }) {
      defer(cleanup)
    },
  })

  await command.launch()
  clearCommands()

  expect(cleanup).toHaveBeenCalledOnce()
})

test('clears the active state without unregistering its command', async () => {
  let launchSignal: AbortSignal | undefined
  const cleanup = vi.fn()
  const launch = vi.fn((context) => {
    launchSignal = context.signal
    return cleanup
  })
  const command = defineLaunchableState('billing.paymentFailed', { launch })
  registerLaunchableState([command])

  await command.launch()
  await clearActiveState()
  await clearActiveState()

  expect(launchSignal?.aborted).toBe(true)
  expect(cleanup).toHaveBeenCalledOnce()
  expect(listCommandRecords()).toEqual([
    expect.objectContaining({
      id: 'billing.paymentFailed',
      isActive: false,
    }),
  ])

  await command.launch()
  expect(launch).toHaveBeenCalledTimes(2)
})

test('does not run launch cleanups when the same state is relaunched', async () => {
  const cleanup = vi.fn()
  const command = defineLaunchableState('billing.paymentFailed', {
    launch: vi.fn(() => cleanup),
  })

  await command.launch()
  await command.launch()

  expect(cleanup).not.toHaveBeenCalled()
})

test('runs attached handler cleanups when another state is activated', async () => {
  const cleanup = vi.fn()
  const first = defineLaunchableState('billing.paymentFailed')
  const second = defineLaunchableState('inbox.manyMessages', { launch: vi.fn() })
  setCommandLaunchHandler(first, () => cleanup)
  registerLaunchableState([second])

  await first.launch()
  await second.launch()

  expect(cleanup).toHaveBeenCalledOnce()
})

test('records cleanups from handlers attached for the active command', async () => {
  const cleanup = vi.fn()
  const first = defineLaunchableState('billing.paymentFailed', { launch: vi.fn() })
  const second = defineLaunchableState('inbox.manyMessages', { launch: vi.fn() })
  registerLaunchableState([first, second])

  await first.launch()
  setCommandLaunchHandler(first, () => cleanup)
  await second.launch()

  expect(cleanup).toHaveBeenCalledOnce()
})

test('propagates cleanup errors once when another state is activated', async () => {
  const error = new Error('Host cleanup failed.')
  const cleanup = vi.fn(() => {
    throw error
  })
  const first = defineLaunchableState('billing.paymentFailed', { launch: () => cleanup })
  const secondLaunch = vi.fn()
  const thirdLaunch = vi.fn()
  const second = defineLaunchableState('inbox.manyMessages', { launch: secondLaunch })
  const third = defineLaunchableState('settings.open', { launch: thirdLaunch })
  registerLaunchableState([first, second, third])

  await first.launch()
  await expect(second.launch()).rejects.toBe(error)
  await third.launch()

  expect(cleanup).toHaveBeenCalledOnce()
  expect(secondLaunch).not.toHaveBeenCalled()
  expect(thirdLaunch).toHaveBeenCalledOnce()
})

test('passes a launch context to handlers', async () => {
  const command = defineLaunchableState('billing.paymentFailed', {
    launch: vi.fn((context) => {
      expect(context.signal).toBeInstanceOf(AbortSignal)
      expect(context.signal.aborted).toBe(false)
      expect(context.signIn).toBeTypeOf('function')
      expect(context.signOut).toBeTypeOf('function')
    }),
  })

  await command.launch()
})

test('aborts in-flight launches when another state is activated', async () => {
  let finishFirstLaunch: (() => void) | undefined
  let firstSignal: AbortSignal | undefined
  const lateCleanup = vi.fn()
  const first = defineLaunchableState('billing.paymentFailed', {
    async launch(context) {
      firstSignal = context.signal
      await new Promise<void>((resolve) => {
        finishFirstLaunch = resolve
      })
      return lateCleanup
    },
  })
  const second = defineLaunchableState('inbox.manyMessages', { launch: vi.fn() })
  registerLaunchableState([first, second])

  const firstLaunch = first.launch()
  await Promise.resolve()

  await second.launch()

  expect(firstSignal?.aborted).toBe(true)

  finishFirstLaunch?.()
  await firstLaunch

  expect(lateCleanup).toHaveBeenCalledOnce()
})

test('rejects missing handlers, unknown ids, and invalid command objects', async () => {
  const command = defineLaunchableState('billing.emptyInvoices')
  registerLaunchableState([command])

  await expect(command.launch()).rejects.toThrow('does not have a launch handler')
  await expect(launchCommand('missing.command')).rejects.toThrow('Unknown state launcher command')
  await expect(
    launchCommand({ id: 'billing.emptyInvoices', launch: async () => {} }),
  ).rejects.toThrow('Invalid state launcher command')
})

test('propagates launch errors', async () => {
  const error = new Error('Host launch failed.')
  const command = defineLaunchableState('billing.paymentFailed', {
    launch() {
      throw error
    },
  })

  await expect(command.launch()).rejects.toBe(error)
})

test('unregisters commands by object or id', async () => {
  const first = defineLaunchableState('billing.paymentFailed', { launch: vi.fn() })
  const second = defineLaunchableState('inbox.empty', { launch: vi.fn() })
  registerLaunchableState([first, second])

  unregisterCommand(first)
  unregisterCommand('inbox.empty')

  await expect(launchCommand('inbox.empty')).rejects.toThrow('Unknown state launcher command')
  expect(listCommandRecords()).toEqual([])
})

test('unregisters every handle for duplicate ids', async () => {
  const first = defineLaunchableState('billing.paymentFailed', { launch: vi.fn() })
  const second = defineLaunchableState('billing.paymentFailed', { launch: vi.fn() })
  registerLaunchableState([first, second])

  unregisterCommand(first)

  await expect(launchCommand(first)).rejects.toThrow('Invalid state launcher command')
  await expect(launchCommand(second)).rejects.toThrow('Invalid state launcher command')
  await expect(launchCommand('billing.paymentFailed')).rejects.toThrow(
    'Unknown state launcher command',
  )
})

test('clears all commands', async () => {
  const command = defineLaunchableState('billing.paymentFailed', { launch: vi.fn() })
  registerLaunchableState([command])

  clearCommands()

  await expect(launchCommand('billing.paymentFailed')).rejects.toThrow(
    'Unknown state launcher command',
  )
  expect(listCommandRecords()).toEqual([])
})

test('attaches and detaches handlers for lifecycle integrations', async () => {
  const command = defineLaunchableState('billing.paymentFailed', {
    label: 'Payment failed',
  })
  const launch = vi.fn()
  const detach = setCommandLaunchHandler(command, launch)

  await command.launch()
  detach()

  expect(launch).toHaveBeenCalledOnce()
  expect(getCommandRecord(command)).toMatchObject({
    id: 'billing.paymentFailed',
    label: 'Payment failed',
  })
  await expect(command.launch()).rejects.toThrow('does not have a launch handler')
})

test('fires newly attached handlers for the active command', async () => {
  const command = defineLaunchableState('billing.paymentFailed', { launch: vi.fn() })
  const continuation = vi.fn()
  registerLaunchableState([command])

  await command.launch()
  setCommandLaunchHandler(command, continuation)

  expect(continuation).toHaveBeenCalledOnce()
})

test('does not double-fire handlers attached during an active launch', async () => {
  const continuation = vi.fn()
  const command = defineLaunchableState('billing.paymentFailed', {
    launch() {
      setCommandLaunchHandler(command, continuation)
    },
  })
  registerLaunchableState([command])

  await command.launch()

  expect(continuation).toHaveBeenCalledOnce()
})
