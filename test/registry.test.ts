import {
  clearCommands,
  defineLaunchableState,
  launchCommand,
  unregisterCommand,
} from '../src/index'
import { getCommandRecord, listCommandRecords, setCommandLaunchHandler } from '../src/registry'

afterEach(() => {
  clearCommands()
})

test('reuses command objects and updates their records', async () => {
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

  expect(second).toBe(first)
  expect(getCommandRecord(first)).toMatchObject({
    id: 'billing.paymentFailed',
    label: 'Payment failed again',
    launch,
  })

  await second.launch()
  expect(launch).toHaveBeenCalledOnce()
})

test('launches commands by object or id', async () => {
  const launch = vi.fn()
  const command = defineLaunchableState('inbox.manyMessages', { launch })

  await command.launch()
  await launchCommand(command)
  await launchCommand('inbox.manyMessages')

  expect(launch).toHaveBeenCalledTimes(3)
})

test('rejects missing handlers, unknown ids, and invalid command objects', async () => {
  const command = defineLaunchableState('billing.emptyInvoices')

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
  defineLaunchableState('inbox.empty', { launch: vi.fn() })

  unregisterCommand(first)
  unregisterCommand('inbox.empty')

  await expect(first.launch()).rejects.toThrow('Invalid state launcher command')
  await expect(launchCommand('inbox.empty')).rejects.toThrow('Unknown state launcher command')
  expect(listCommandRecords()).toEqual([])
})

test('clears all commands', async () => {
  const command = defineLaunchableState('billing.paymentFailed', { launch: vi.fn() })

  clearCommands()

  await expect(command.launch()).rejects.toThrow('Invalid state launcher command')
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
