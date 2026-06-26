import {
  clearCommands,
  defineLaunchableState,
  mountStateLauncher,
  registerLaunchableState,
} from '../src/index'

const launchHistoryStorageKey = 'state-launcher.launch-history.v1'

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: createTestStorage(),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
  window.localStorage.clear()
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
  expect(host?.style.position).toBe('fixed')
  expect(host?.style.zIndex).toBe('2147483647')
  expect(host?.style.top).toBe('24px')
  expect(host?.style.left).toBe('24px')
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

test('focuses the filter input when initially open', async () => {
  const focus = vi.spyOn(HTMLInputElement.prototype, 'focus')

  mountStateLauncher({ initiallyOpen: true })
  await nextRender()

  expect(focus).toHaveBeenCalledOnce()
})

test('focuses the filter input when opened with controller', async () => {
  const focus = vi.spyOn(HTMLInputElement.prototype, 'focus')
  const launcher = mountStateLauncher()

  launcher.open()
  await nextRender()

  expect(focus).toHaveBeenCalledOnce()
})

test('hides the launcher when focus leaves the panel', async () => {
  const launcher = mountStateLauncher({ initiallyOpen: true })
  await nextRender()
  const shadowRoot = getLauncherShadowRoot()
  const search = shadowRoot?.querySelector<HTMLInputElement>('input[type="search"]')
  const outsideButton = document.createElement('button')
  document.body.append(outsideButton)

  search!.dispatchEvent(
    new FocusEvent('focusout', { bubbles: true, relatedTarget: outsideButton }),
  )
  await nextRender()

  expect(shadowRoot?.querySelector('[role="dialog"]')).toBeNull()

  launcher.unmount()
})

test('keeps the launcher open when focus moves inside the panel', async () => {
  registerLaunchableState([
    defineLaunchableState('billing.paymentFailed', {
      label: 'Payment failed',
      launch: vi.fn(),
    }),
  ])
  const launcher = mountStateLauncher({ initiallyOpen: true })
  await nextRender()
  const shadowRoot = getLauncherShadowRoot()
  const search = shadowRoot?.querySelector<HTMLInputElement>('input[type="search"]')
  const command = shadowRoot?.querySelector<HTMLButtonElement>('[role="option"]')

  search!.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: command }))
  await nextRender()

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

test('keeps the current filter when registered commands change', async () => {
  registerLaunchableState([
    defineLaunchableState('billing.paymentFailed', {
      label: 'Payment failed',
    }),
    defineLaunchableState('inbox.manyMessages', {
      label: 'Many messages',
    }),
  ])

  mountStateLauncher({ initiallyOpen: true })
  const shadowRoot = getLauncherShadowRoot()
  const search = shadowRoot?.querySelector<HTMLInputElement>('input[type="search"]')

  search!.value = 'billing'
  search!.dispatchEvent(new InputEvent('input', { bubbles: true }))
  await nextRender()

  registerLaunchableState([
    defineLaunchableState('billing.emptyInvoices', {
      label: 'Empty invoices',
    }),
  ])
  await nextRender()

  expect(shadowRoot?.textContent).toContain('Payment failed')
  expect(shadowRoot?.textContent).toContain('Empty invoices')
  expect(shadowRoot?.textContent).not.toContain('Many messages')
})

test('does not refocus the filter input while filtering', async () => {
  const focus = vi.spyOn(HTMLInputElement.prototype, 'focus')
  registerLaunchableState([
    defineLaunchableState('billing.paymentFailed', {
      label: 'Payment failed',
    }),
  ])

  mountStateLauncher({ initiallyOpen: true })
  await nextRender()
  const search = getLauncherShadowRoot()?.querySelector<HTMLInputElement>('input[type="search"]')

  expect(focus).toHaveBeenCalledOnce()

  search!.value = 'payment'
  search!.dispatchEvent(new InputEvent('input', { bubbles: true }))
  await nextRender()

  expect(focus).toHaveBeenCalledOnce()
})

test('refreshes visible commands from the dom query when reopened', async () => {
  registerLaunchableState([
    defineLaunchableState('billing.paymentFailed', {
      label: 'Payment failed',
      tags: ['card'],
    }),
    defineLaunchableState('inbox.manyMessages', {
      label: 'Many messages',
    }),
  ])

  const launcher = mountStateLauncher({ initiallyOpen: true })
  let search = getLauncherShadowRoot()?.querySelector<HTMLInputElement>('input[type="search"]')

  search!.value = 'card'
  search!.dispatchEvent(new InputEvent('input', { bubbles: true }))
  await nextRender()

  expect(getLauncherShadowRoot()?.textContent).toContain('Payment failed')
  expect(getLauncherShadowRoot()?.textContent).not.toContain('Many messages')

  launcher.close()
  await nextRender()
  launcher.open()
  await nextRender()
  search = getLauncherShadowRoot()?.querySelector<HTMLInputElement>('input[type="search"]')

  expect(search?.value).toBe('')
  expect(getLauncherShadowRoot()?.textContent).toContain('Payment failed')
  expect(getLauncherShadowRoot()?.textContent).toContain('Many messages')
})

test('boosts states launched in the past 24 hours in search results', async () => {
  const now = Date.now()
  window.localStorage.setItem(
    launchHistoryStorageKey,
    JSON.stringify({
      'billing.paymentFailed': [now - 1000, now - 2000],
    }),
  )
  registerLaunchableState([
    defineLaunchableState('billing.emptyInvoices', {
      label: 'Empty invoices',
      launch: vi.fn(),
    }),
    defineLaunchableState('billing.paymentFailed', {
      label: 'Payment failed',
      launch: vi.fn(),
    }),
  ])

  mountStateLauncher({ initiallyOpen: true })
  const search = getLauncherShadowRoot()?.querySelector<HTMLInputElement>('input[type="search"]')

  search!.value = 'billing'
  search!.dispatchEvent(new InputEvent('input', { bubbles: true }))
  await nextRender()

  expect(getCommandLabels()).toEqual(['Payment failed', 'Empty invoices'])
})

test('ignores launch counts older than 24 hours', async () => {
  const now = Date.now()
  window.localStorage.setItem(
    launchHistoryStorageKey,
    JSON.stringify({
      'billing.emptyInvoices': [now - 25 * 60 * 60 * 1000, now - 26 * 60 * 60 * 1000],
      'billing.paymentFailed': [now - 1000],
    }),
  )
  registerLaunchableState([
    defineLaunchableState('billing.emptyInvoices', {
      label: 'Empty invoices',
      launch: vi.fn(),
    }),
    defineLaunchableState('billing.paymentFailed', {
      label: 'Payment failed',
      launch: vi.fn(),
    }),
  ])

  mountStateLauncher({ initiallyOpen: true })
  const search = getLauncherShadowRoot()?.querySelector<HTMLInputElement>('input[type="search"]')

  search!.value = 'billing'
  search!.dispatchEvent(new InputEvent('input', { bubbles: true }))
  await nextRender()

  expect(getCommandLabels()).toEqual(['Payment failed', 'Empty invoices'])
  expect(JSON.parse(window.localStorage.getItem(launchHistoryStorageKey)!)).toEqual({
    'billing.paymentFailed': [now - 1000],
  })
})

test('remembers launched states for later launcher mounts', async () => {
  const paymentLaunch = vi.fn()
  registerLaunchableState([
    defineLaunchableState('billing.emptyInvoices', {
      label: 'Empty invoices',
      launch: vi.fn(),
    }),
    defineLaunchableState('billing.paymentFailed', {
      label: 'Payment failed',
      launch: paymentLaunch,
    }),
  ])
  const launcher = mountStateLauncher({ initiallyOpen: true })
  await nextRender()

  getCommandButton('Payment failed')?.click()
  await nextRender()

  expect(paymentLaunch).toHaveBeenCalledOnce()

  launcher.unmount()
  mountStateLauncher({ initiallyOpen: true })
  const secondSearch =
    getLauncherShadowRoot()?.querySelector<HTMLInputElement>('input[type="search"]')

  secondSearch!.value = 'billing'
  secondSearch!.dispatchEvent(new InputEvent('input', { bubbles: true }))
  await nextRender()

  expect(getCommandLabels()).toEqual(['Payment failed', 'Empty invoices'])
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

test('resets the filter input after launching with keyboard', async () => {
  const launch = vi.fn()
  registerLaunchableState([
    defineLaunchableState('billing.paymentFailed', {
      label: 'Payment failed',
      launch,
    }),
  ])

  mountStateLauncher({ initiallyOpen: true })
  const search = getLauncherShadowRoot()?.querySelector<HTMLInputElement>('input[type="search"]')

  search!.value = 'payment'
  search!.dispatchEvent(new InputEvent('input', { bubbles: true }))
  await nextRender()
  search!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
  await nextRender()

  expect(launch).toHaveBeenCalledOnce()
  expect(search?.value).toBe('')
})

test('resets the filter input after launching with click', async () => {
  const launch = vi.fn()
  registerLaunchableState([
    defineLaunchableState('billing.paymentFailed', {
      label: 'Payment failed',
      launch,
    }),
  ])

  mountStateLauncher({ initiallyOpen: true })
  const shadowRoot = getLauncherShadowRoot()
  const search = shadowRoot?.querySelector<HTMLInputElement>('input[type="search"]')

  search!.value = 'payment'
  search!.dispatchEvent(new InputEvent('input', { bubbles: true }))
  await nextRender()
  shadowRoot?.querySelector<HTMLButtonElement>('[role="option"]')?.click()
  await nextRender()

  expect(launch).toHaveBeenCalledOnce()
  expect(search?.value).toBe('')
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

test('ranks commands with handlers before disabled commands', async () => {
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
  await nextRender()
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

function getCommandLabels() {
  return [...getLauncherShadowRoot()!.querySelectorAll('[role="option"]')].map(
    (command) => command.querySelector('span')?.textContent,
  )
}

function getCommandButton(label: string) {
  return [...getLauncherShadowRoot()!.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
    (command) => command.querySelector('span')?.textContent === label,
  )
}

function createTestStorage(): Storage {
  const values = new Map<string, string>()

  return {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key) {
      return values.get(key) ?? null
    },
    key(index) {
      return [...values.keys()][index] ?? null
    },
    removeItem(key) {
      values.delete(key)
    },
    setItem(key, value) {
      values.set(key, value)
    },
  }
}

async function nextRender() {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}
