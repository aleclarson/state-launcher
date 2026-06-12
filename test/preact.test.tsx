import { h, render } from 'preact'
import { act } from 'preact/test-utils'

import { clearCommands, defineLaunchableState, registerLaunchableState } from '../src/index'
import { getCommandRecord } from '../src/registry'
import { useLaunchableState } from '../src/preact'

afterEach(() => {
  render(null, document.body)
  document.body.replaceChildren()
  clearCommands()
})

test('registers a launch handler while mounted', async () => {
  const command = defineLaunchableState('billing.paymentFailed')
  const launch = vi.fn()

  await act(async () => {
    render(h(Launchable, { command, handler: launch }), document.body)
  })

  await command.launch()

  expect(launch).toHaveBeenCalledOnce()
})

test('updates the launch handler after rerender', async () => {
  const command = defineLaunchableState('billing.paymentFailed')
  const first = vi.fn()
  const second = vi.fn()

  await act(async () => {
    render(h(Launchable, { command, handler: first }), document.body)
  })
  await act(async () => {
    render(h(Launchable, { command, handler: second }), document.body)
  })

  await command.launch()

  expect(first).not.toHaveBeenCalled()
  expect(second).toHaveBeenCalledOnce()
})

test('removes its handler on unmount while preserving metadata', async () => {
  const command = defineLaunchableState('billing.paymentFailed', {
    label: 'Payment failed',
    description: 'Customer has a failed payment method.',
    tags: ['billing'],
  })
  const launch = vi.fn()

  await act(async () => {
    render(h(Launchable, { command, handler: launch }), document.body)
  })
  await act(async () => {
    render(null, document.body)
  })

  expect(getCommandRecord(command)).toMatchObject({
    label: 'Payment failed',
    description: 'Customer has a failed payment method.',
    tags: ['billing'],
  })
  await expect(command.launch()).rejects.toThrow('does not have a launch handler')
})

test('does not remove a newer handler on unmount', async () => {
  const command = defineLaunchableState('billing.paymentFailed')
  const hookHandler = vi.fn()
  const newerHandler = vi.fn()

  await act(async () => {
    render(h(Launchable, { command, handler: hookHandler }), document.body)
  })
  registerLaunchableState([
    defineLaunchableState('billing.paymentFailed', {
      launch: newerHandler,
    }),
  ])
  await act(async () => {
    render(null, document.body)
  })

  await command.launch()

  expect(hookHandler).not.toHaveBeenCalled()
  expect(newerHandler).toHaveBeenCalledOnce()
})

test('fires mounted handlers immediately for the active command', async () => {
  const command = defineLaunchableState('billing.paymentFailed', { launch: vi.fn() })
  const continuation = vi.fn()
  registerLaunchableState([command])

  await command.launch()
  await act(async () => {
    render(h(Launchable, { command, handler: continuation }), document.body)
  })

  expect(continuation).toHaveBeenCalledOnce()
})

function Launchable({
  command,
  handler,
}: {
  command: ReturnType<typeof defineLaunchableState>
  handler: () => void | Promise<void>
}) {
  useLaunchableState(command, handler)
  return null
}
