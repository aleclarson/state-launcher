import { clearCommands, defineLaunchableState, mountStateLauncher } from '../src/index'

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

test('toggles from the floating button', () => {
  mountStateLauncher()
  const shadowRoot = document.querySelector<HTMLElement>(
    '[data-state-launcher-host="true"]',
  )?.shadowRoot
  const button = shadowRoot?.querySelector<HTMLButtonElement>('button')

  button?.click()

  expect(button?.getAttribute('aria-expanded')).toBe('true')
  expect(shadowRoot?.querySelector('[role="dialog"]')).toBeTruthy()
})

test('unmount removes launcher dom and is idempotent', () => {
  const launcher = mountStateLauncher()

  launcher.unmount()
  launcher.unmount()
  launcher.open()

  expect(document.querySelector('[data-state-launcher-host="true"]')).toBeNull()
})

test('renders registered commands grouped by id prefix', () => {
  defineLaunchableState('billing.paymentFailed', {
    label: 'Payment failed',
    description: 'Customer has a failed payment method.',
  })
  defineLaunchableState('inbox.manyMessages', {
    label: 'Many messages',
  })
  defineLaunchableState('reset', {
    label: 'Reset app',
  })

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
  defineLaunchableState('billing.paymentFailed', {
    label: 'Payment failed',
    tags: ['card'],
  })
  defineLaunchableState('inbox.manyMessages', {
    label: 'Many messages',
  })

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
  defineLaunchableState('billing.paymentFailed', {
    label: 'Payment failed',
    launch: firstLaunch,
  })
  defineLaunchableState('inbox.manyMessages', {
    label: 'Many messages',
    launch: secondLaunch,
  })

  mountStateLauncher({ initiallyOpen: true })
  const search = getLauncherShadowRoot()?.querySelector<HTMLInputElement>('input[type="search"]')

  search!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }))
  await nextRender()
  search!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
  await nextRender()

  expect(firstLaunch).not.toHaveBeenCalled()
  expect(secondLaunch).toHaveBeenCalledOnce()
})

test('shows launch errors without crashing the panel', async () => {
  defineLaunchableState('billing.paymentFailed', {
    label: 'Payment failed',
  })

  mountStateLauncher({ initiallyOpen: true })
  const shadowRoot = getLauncherShadowRoot()
  const command = shadowRoot?.querySelector<HTMLButtonElement>('[role="option"]')

  command!.click()
  await nextRender()

  expect(shadowRoot?.querySelector('[role="alert"]')?.textContent).toContain(
    'does not have a launch handler',
  )
  expect(shadowRoot?.querySelector('[role="dialog"]')).toBeTruthy()
})

function getLauncherShadowRoot() {
  return document.querySelector<HTMLElement>('[data-state-launcher-host="true"]')?.shadowRoot
}

async function nextRender() {
  await Promise.resolve()
  await Promise.resolve()
}
