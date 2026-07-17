import { createElement, Fragment, type ReactNode } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { clearCommands, defineLaunchableState, type LaunchHandler } from '../src/index'
import { useLaunchableState } from '../src/react'
import { getCommandRecord, listCommandRecords, setCommandLaunchHandler } from '../src/registry'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  clearCommands()
})

test('registers the command and launch handler while mounted', async () => {
  const command = defineLaunchableState('billing.paymentFailed')
  const launch = vi.fn()

  await render(createElement(Launchable, { command, handler: launch }))

  expect(listCommandRecords()).toMatchObject([
    { id: 'billing.paymentFailed', hasLaunchHandler: true },
  ])
  await command.launch()
  expect(launch).toHaveBeenCalledOnce()
})

test('defines a stable local command with the latest handler and cleans it up', async () => {
  const first = vi.fn()
  const second = vi.fn()
  let firstCommand: ReturnType<typeof defineLaunchableState> | undefined
  let secondCommand: ReturnType<typeof defineLaunchableState> | undefined

  await render(
    createElement(LocalLaunchable, {
      handler: first,
      receiveCommand: (command) => (firstCommand = command),
    }),
  )
  await render(
    createElement(LocalLaunchable, {
      handler: second,
      receiveCommand: (command) => (secondCommand = command),
    }),
  )

  expect(secondCommand).toBe(firstCommand)
  expect(listCommandRecords()).toMatchObject([
    { id: 'billing.paymentFailed', label: 'Payment failed', hasLaunchHandler: true },
  ])
  await secondCommand!.launch()
  expect(first).not.toHaveBeenCalled()
  expect(second).toHaveBeenCalledOnce()

  await render(null)
  expect(listCommandRecords()).toEqual([])
  await expect(secondCommand!.launch()).rejects.toThrow('Invalid state launcher command')
})

test('removes its exact handler on unmount while preserving command metadata', async () => {
  const command = defineLaunchableState('billing.paymentFailed', {
    label: 'Payment failed',
    tags: ['billing'],
  })

  await render(createElement(Launchable, { command, handler: vi.fn() }))
  await render(null)

  expect(getCommandRecord(command)).toMatchObject({
    label: 'Payment failed',
    tags: ['billing'],
  })
  expect(listCommandRecords()).toMatchObject([{ hasLaunchHandler: false }])
  await expect(command.launch()).rejects.toThrow('does not have a launch handler')
})

test('does not remove another handler when it unmounts', async () => {
  const command = defineLaunchableState('billing.paymentFailed')
  const hookHandler = vi.fn()
  const otherHandler = vi.fn()

  await render(createElement(Launchable, { command, handler: hookHandler }))
  setCommandLaunchHandler(command, otherHandler)
  await render(null)
  await command.launch()

  expect(hookHandler).not.toHaveBeenCalled()
  expect(otherHandler).toHaveBeenCalledOnce()
})

test('supports multiple handlers for one command', async () => {
  const command = defineLaunchableState('billing.paymentFailed')
  const first = vi.fn()
  const second = vi.fn()

  await render(
    createElement(
      Fragment,
      null,
      createElement(Launchable, { command, handler: first }),
      createElement(Launchable, { command, handler: second }),
    ),
  )
  await command.launch()

  expect(first).toHaveBeenCalledOnce()
  expect(second).toHaveBeenCalledOnce()
})

test('fires a handler immediately when it mounts for the active command', async () => {
  const initial = vi.fn()
  const command = defineLaunchableState('billing.paymentFailed', { launch: initial })
  const continuation = vi.fn()

  await command.launch()
  await render(createElement(Launchable, { command, handler: continuation }))

  expect(initial).toHaveBeenCalledOnce()
  expect(continuation).toHaveBeenCalledOnce()
})

test('replays an active state when a local command mounts later', async () => {
  const initial = vi.fn()
  const command = defineLaunchableState('billing.paymentFailed', { launch: initial })
  const continuation = vi.fn()

  await command.launch()
  await render(
    createElement(LocalLaunchable, {
      handler: continuation,
      receiveCommand: vi.fn(),
    }),
  )

  expect(initial).toHaveBeenCalledOnce()
  expect(continuation).toHaveBeenCalledOnce()
})

test('uses the latest handler without reattaching on each render', async () => {
  const command = defineLaunchableState('billing.paymentFailed')
  const first = vi.fn()
  const second = vi.fn()

  await render(createElement(Launchable, { command, handler: first }))
  await render(createElement(Launchable, { command, handler: second }))
  await command.launch()

  expect(first).not.toHaveBeenCalled()
  expect(second).toHaveBeenCalledOnce()
})

async function render(children: ReactNode): Promise<void> {
  await act(async () => root.render(children))
}

function Launchable({
  command,
  handler,
}: {
  command: ReturnType<typeof defineLaunchableState>
  handler: LaunchHandler
}) {
  useLaunchableState(command, handler)
  return null
}

function LocalLaunchable({
  handler,
  receiveCommand,
}: {
  handler: LaunchHandler
  receiveCommand: (command: ReturnType<typeof defineLaunchableState>) => void
}) {
  const command = useLaunchableState('billing.paymentFailed', {
    label: 'Payment failed',
    tags: ['billing'],
    launch: handler,
  })
  receiveCommand(command)
  return null
}
