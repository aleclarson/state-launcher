import {
  clearCommands,
  defineLaunchableState,
  mountStateLauncher,
  registerLaunchableState,
} from '../src/index'

afterEach(() => {
  document.body.replaceChildren()
  clearCommands()
})

test('mounts the launcher into a shadow dom host', () => {
  const target = document.createElement('main')
  document.body.append(target)

  const launcher = mountStateLauncher({
    target,
    initiallyOpen: true,
    position: 'top-left',
    title: 'Debug states',
  })
  const host = target.querySelector<HTMLElement>('[data-state-launcher-host="true"]')
  const shadowRoot = host?.shadowRoot

  expect(host).toBeTruthy()
  expect(shadowRoot).toBeTruthy()
  expect(shadowRoot?.querySelector('[data-state-launcher]')?.getAttribute('data-position')).toBe(
    'top-left',
  )
  expect(shadowRoot?.querySelector('[role="dialog"]')?.textContent).toContain('Debug states')

  launcher.unmount()
})

test('controls open, close, and toggle state', () => {
  const launcher = mountStateLauncher()
  const shadowRoot = document.querySelector<HTMLElement>(
    '[data-state-launcher-host="true"]',
  )?.shadowRoot

  expect(shadowRoot?.querySelector('[role="dialog"]')).toBeNull()

  launcher.open()
  expect(shadowRoot?.querySelector('[role="dialog"]')).toBeTruthy()

  launcher.close()
  expect(shadowRoot?.querySelector('[role="dialog"]')).toBeNull()

  launcher.toggle()
  expect(shadowRoot?.querySelector('[role="dialog"]')).toBeTruthy()

  launcher.unmount()
})

test('unmount removes launcher dom and is idempotent', () => {
  const launcher = mountStateLauncher()

  launcher.unmount()
  launcher.unmount()
  launcher.open()

  expect(document.querySelector('[data-state-launcher-host="true"]')).toBeNull()
})

test('renders registered commands grouped by id prefix', () => {
  registerLaunchableState([
    defineLaunchableState('billing.paymentFailed', {
      label: 'Payment failed',
      description: 'Customer has a failed payment method.',
    }),
    defineLaunchableState('inbox.manyMessages', {
      label: 'Many messages',
    }),
    defineLaunchableState('reset', {
      label: 'Reset app',
    }),
  ])

  mountStateLauncher({ initiallyOpen: true })
  const shadowRoot = getLauncherShadowRoot()

  expect(shadowRoot?.textContent).toContain('billing')
  expect(shadowRoot?.textContent).toContain('Payment failed')
  expect(shadowRoot?.textContent).toContain('inbox')
  expect(shadowRoot?.textContent).toContain('Many messages')
  expect(shadowRoot?.textContent).toContain('ungrouped')
  expect(shadowRoot?.textContent).toContain('Reset app')
})

test('filters commands with fuzzysort2', async () => {
  registerLaunchableState([
    defineLaunchableState('billing.paymentFailed', {
      label: 'Payment failed',
      tags: ['card'],
    }),
    defineLaunchableState('inbox.manyMessages', {
      label: 'Many messages',
    }),
  ])

  mountStateLauncher({ initiallyOpen: true })
  const shadowRoot = getLauncherShadowRoot()
  const search = shadowRoot?.querySelector<HTMLInputElement>('input[type="search"]')

  search!.value = 'card'
  search!.dispatchEvent(new InputEvent('input', { bubbles: true }))
  await nextRender()

  expect(shadowRoot?.textContent).toContain('Payment failed')
  expect(shadowRoot?.textContent).not.toContain('Many messages')
})

test('activates the selected command with keyboard navigation', async () => {
  const firstLaunch = vi.fn()
  const secondLaunch = vi.fn()
  registerLaunchableState([
    defineLaunchableState('billing.paymentFailed', {
      label: 'Payment failed',
      launch: firstLaunch,
    }),
    defineLaunchableState('inbox.manyMessages', {
      label: 'Many messages',
      launch: secondLaunch,
    }),
  ])

  mountStateLauncher({ initiallyOpen: true })
  const search = getLauncherShadowRoot()?.querySelector<HTMLInputElement>('input[type="search"]')

  search!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }))
  await nextRender()
  search!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
  await nextRender()

  expect(firstLaunch).not.toHaveBeenCalled()
  expect(secondLaunch).toHaveBeenCalledOnce()
})

test('disables commands without launch handlers', async () => {
  registerLaunchableState([
    defineLaunchableState('billing.paymentFailed', {
      label: 'Payment failed',
    }),
  ])

  mountStateLauncher({ initiallyOpen: true })
  const shadowRoot = getLauncherShadowRoot()
  const command = shadowRoot?.querySelector<HTMLButtonElement>('[role="option"]')

  expect(command?.disabled).toBe(true)
  expect(command?.getAttribute('aria-disabled')).toBe('true')

  command!.click()
  await nextRender()

  expect(shadowRoot?.querySelector('[role="alert"]')).toBeNull()
})

test('ranks commands with handlers before disabled commands', () => {
  registerLaunchableState([
    defineLaunchableState('aaa.disabled', {
      label: 'AAA disabled',
    }),
    defineLaunchableState('zzz.enabled', {
      label: 'ZZZ enabled',
      launch: vi.fn(),
    }),
  ])

  mountStateLauncher({ initiallyOpen: true })
  const commands = [
    ...getLauncherShadowRoot()!.querySelectorAll<HTMLButtonElement>('[role="option"]'),
  ]

  expect(commands.map((command) => command.textContent)).toEqual([
    expect.stringContaining('ZZZ enabled'),
    expect.stringContaining('AAA disabled'),
  ])
})

function getLauncherShadowRoot() {
  return document.querySelector<HTMLElement>('[data-state-launcher-host="true"]')?.shadowRoot
}

async function nextRender() {
  await Promise.resolve()
  await Promise.resolve()
}
