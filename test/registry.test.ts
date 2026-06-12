import {
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
