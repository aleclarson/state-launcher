import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  clearCommands,
  defineLaunchableState,
  mountStateLauncher,
  registerLaunchableState,
  type MountStateLauncherOptions,
} from '../src/index'

const launcherCss = readFileSync(resolve('src/launcher.module.css'), 'utf8')

const launchHistoryStorageKey = 'state-launcher.launch-history.v1'

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: createTestStorage(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.replaceChildren()
  window.localStorage.clear()
  clearCommands()
})

test.each(['bottom-right', 'bottom-left', 'top-right', 'top-left'] as const)(
  'renders the %s launcher from a non-blocking host',
  (position) => {
    const target = document.createElement('main')
    document.body.append(target)

    const launcher = mountStateLauncher({
      target,
      initiallyOpen: true,
      position,
      title: 'Debug states',
    })
    const host = target.querySelector<HTMLElement>('[data-state-launcher-host="true"]')
    const shadowRoot = host?.shadowRoot

    expect(host).toBeTruthy()
    expect(shadowRoot).toBeTruthy()
    expect(host?.style.position).toBe('fixed')
    expect(host?.style.zIndex).toBe('2147483647')
    expect(host?.style.bottom).toBe('')
    expect(host?.style.height).toBe('0px')
    expect(host?.style.left).toBe('0px')
    expect(host?.style.pointerEvents).toBe('')
    expect(host?.style.right).toBe('')
    expect(host?.style.top).toBe('0px')
    expect(host?.style.width).toBe('0px')
    expect(shadowRoot?.querySelector('[data-state-launcher]')?.getAttribute('data-position')).toBe(
      position,
    )
    expect(shadowRoot?.querySelector('[role="dialog"]')?.textContent).toContain('Debug states')

    launcher.unmount()
  },
)

test('fixes the mobile drawer container to the visible viewport', () => {
  mountStateLauncher({ initiallyOpen: true })
  const shadowRoot = getLauncherShadowRoot()
  const panel = shadowRoot?.querySelector<HTMLElement>('[role="dialog"]')

  expect(panel).toBeTruthy()
  expect(launcherCss).toContain('position: fixed')
  expect(launcherCss).toContain('@media (max-width: 1024px)')
  expect(launcherCss).toContain('border-radius: 14px 14px 0 0')
  expect(launcherCss).toContain('height: var(--state-launcher-visible-height, 100dvh)')
  expect(launcherCss).toContain('top: var(--state-launcher-visible-top, 0px)')
  expect(launcherCss).toContain('top: calc(20px + env(safe-area-inset-top))')
  expect(launcherCss).toContain('height: calc(100% - 20px - env(safe-area-inset-top))')
  expect(launcherCss).toContain('state-launcher-slide-in')
  expect(launcherCss).toContain('state-launcher-slide-out')
})

test('contains command list overscroll inside the launcher', () => {
  expect(launcherCss).toMatch(/\.groups \{[\s\S]*?overscroll-behavior: contain/)
})

test('tracks the visual viewport while the mobile keyboard is visible', async () => {
  const visualViewport = createTestVisualViewport(812, 0)
  vi.stubGlobal('visualViewport', visualViewport)

  mountStateLauncher({ initiallyOpen: true })
  await nextRender()
  const launcher = getLauncherShadowRoot()?.querySelector<HTMLElement>('[data-state-launcher]')

  expect(launcher?.style.getPropertyValue('--state-launcher-visible-height')).toBe('812px')
  expect(launcher?.style.getPropertyValue('--state-launcher-visible-top')).toBe('0px')

  visualViewport.height = 463
  visualViewport.offsetTop = 117
  visualViewport.dispatchEvent(new Event('resize'))

  expect(launcher?.style.getPropertyValue('--state-launcher-visible-height')).toBe('463px')
  expect(launcher?.style.getPropertyValue('--state-launcher-visible-top')).toBe('117px')
})

test('renders mobile drawer dismissal affordances', () => {
  mountStateLauncher({ initiallyOpen: true })
  const shadowRoot = getLauncherShadowRoot()

  expect(shadowRoot?.querySelector('[aria-label="Close launcher"]')).toBeTruthy()
  expect(shadowRoot?.querySelector('[aria-hidden="true"]')).toBeTruthy()
  expect(launcherCss).toContain('touch-action: none')
})

test('refreshes the page from the title bar', () => {
  const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {})
  mountStateLauncher({ initiallyOpen: true })
  const refreshButton = getLauncherShadowRoot()?.querySelector<HTMLButtonElement>(
    'header [aria-label="Refresh page"]',
  )

  refreshButton?.click()

  expect(refreshButton).toBeTruthy()
  expect(reload).toHaveBeenCalledOnce()
})

test('shows an auth toggle only when both auth handlers are configured', async () => {
  const onSignIn = vi.fn()
  const onSignOut = vi.fn()

  mountStateLauncher({ initiallyOpen: true })
  expect(getLauncherShadowRoot()?.querySelector('[aria-label="Sign out"]')).toBeNull()

  document.body.replaceChildren()
  mountStateLauncher({
    auth: { onSignIn, onSignOut },
    initiallyOpen: true,
  })
  const titleBarButtons = [
    ...getLauncherShadowRoot()!.querySelectorAll<HTMLButtonElement>('header button'),
  ]

  expect(titleBarButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
    'Sign out',
    'Refresh page',
  ])

  titleBarButtons[0]?.click()
  await nextRender()

  expect(onSignOut).toHaveBeenCalledOnce()
  expect(onSignIn).not.toHaveBeenCalled()

  const signInButton =
    getLauncherShadowRoot()?.querySelector<HTMLButtonElement>('[aria-label="Sign in"]')
  signInButton?.click()
  await nextRender()

  expect(signInButton).toBeTruthy()
  expect(onSignIn).toHaveBeenCalledOnce()
  expect(getLauncherShadowRoot()?.querySelector('[aria-label="Sign out"]')).toBeTruthy()
})

test('keeps the current auth action when its handler fails', async () => {
  mountStateLauncher({
    auth: {
      onSignIn: vi.fn(),
      onSignOut: vi.fn().mockRejectedValue(new Error('Sign out failed.')),
    },
    initiallyOpen: true,
  })

  getLauncherShadowRoot()?.querySelector<HTMLButtonElement>('[aria-label="Sign out"]')?.click()
  await nextRender()

  expect(getLauncherShadowRoot()?.querySelector('[aria-label="Sign out"]')).toBeTruthy()
  expect(getLauncherShadowRoot()?.querySelector('[role="alert"]')?.textContent).toBe(
    'Sign out failed.',
  )
})

test('requires auth handlers to be defined together', () => {
  expect(() =>
    mountStateLauncher({
      auth: { onSignIn: vi.fn() } as unknown as MountStateLauncherOptions['auth'],
    }),
  ).toThrow('auth.onSignIn and auth.onSignOut must be defined together')
  expect(document.querySelector('[data-state-launcher-host="true"]')).toBeNull()
})

test('hides the launcher when the area above the mobile drawer is tapped', async () => {
  mountStateLauncher({ initiallyOpen: true })
  const shadowRoot = getLauncherShadowRoot()

  shadowRoot?.querySelector<HTMLButtonElement>('[aria-label="Close launcher"]')?.click()
  await nextRender()

  expect(shadowRoot?.querySelector('[role="dialog"]')).toBeNull()
  expect(shadowRoot?.querySelector('[data-state="closed"]')).toBeTruthy()
})

test('hides the launcher after a downward swipe from the drawer header', async () => {
  mountStateLauncher({ initiallyOpen: true })
  const shadowRoot = getLauncherShadowRoot()
  const header = shadowRoot?.querySelector('header')

  header?.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 40, pointerId: 1 }),
  )
  header?.dispatchEvent(
    new PointerEvent('pointermove', { bubbles: true, clientX: 24, clientY: 100, pointerId: 1 }),
  )
  await nextRender()

  expect(shadowRoot?.querySelector('[role="dialog"]')).toBeNull()
})

test('keeps the launcher open for a short or mostly horizontal header swipe', async () => {
  mountStateLauncher({ initiallyOpen: true })
  const shadowRoot = getLauncherShadowRoot()
  const header = shadowRoot?.querySelector('header')

  header?.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 40, pointerId: 1 }),
  )
  header?.dispatchEvent(
    new PointerEvent('pointermove', { bubbles: true, clientX: 90, clientY: 75, pointerId: 1 }),
  )
  await nextRender()

  expect(shadowRoot?.querySelector('[role="dialog"]')).toBeTruthy()
})

test('uses mobile and tablet font sizes that keep the filter input readable without zooming', () => {
  expect(launcherCss).toMatch(
    /@media \(max-width: 1024px\)[\s\S]*?\.stateLauncher\.bottom-right[\s\S]*?font-size: 16px/,
  )
  expect(launcherCss).toMatch(/\.header h2 \{\s*font-size: 16px/)
  expect(launcherCss).toMatch(/\.groupTitle \{\s*font-size: 14px/)
  expect(launcherCss).toMatch(/\.commandDescription \{\s*font-size: 14px/)
  expect(launcherCss).toMatch(/\.commandId \{\s*font-size: 13px/)
})

test('controls open, close, and toggle state', () => {
  const launcher = mountStateLauncher()
  const shadowRoot = document.querySelector<HTMLElement>(
    '[data-state-launcher-host="true"]',
  )?.shadowRoot

  expect(shadowRoot?.querySelector('[role="dialog"]')).toBeNull()
  expect(shadowRoot?.querySelector('[data-state="idle"]')).toBeTruthy()

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

test('blurs the filter input when the launcher hides on mobile', async () => {
  const blur = vi.spyOn(HTMLInputElement.prototype, 'blur')
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true })),
  )
  const launcher = mountStateLauncher({ initiallyOpen: true })
  await nextRender()

  launcher.close()
  await nextRender()

  expect(blur).toHaveBeenCalledOnce()
})

test('hides the launcher when Escape is pressed in the filter input', async () => {
  mountStateLauncher({ initiallyOpen: true })
  const shadowRoot = getLauncherShadowRoot()
  const search = shadowRoot?.querySelector<HTMLInputElement>('input[type="search"]')
  const escape = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: 'Escape',
  })

  search!.dispatchEvent(escape)
  await nextRender()

  expect(escape.defaultPrevented).toBe(true)
  expect(shadowRoot?.querySelector('[role="dialog"]')).toBeNull()
})

test('hides the launcher when focus leaves the panel', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  )
  const launcher = mountStateLauncher({ initiallyOpen: true })
  await nextRender()
  const shadowRoot = getLauncherShadowRoot()
  const search = shadowRoot?.querySelector<HTMLInputElement>('input[type="search"]')
  const outsideButton = document.createElement('button')
  document.body.append(outsideButton)

  search!.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: outsideButton }))
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

test('discovers a command registered while the launcher subscription is mounting', async () => {
  mountStateLauncher({ initiallyOpen: true })
  registerLaunchableState([
    defineLaunchableState('billing.paymentFailed', {
      label: 'Payment failed',
      launch: vi.fn(),
    }),
  ])

  await nextRender()

  expect(getLauncherShadowRoot()?.textContent).toContain('Payment failed')
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

test('shows recently launched commands once in a leading group', async () => {
  const now = Date.now()
  window.localStorage.setItem(
    launchHistoryStorageKey,
    JSON.stringify({
      'archived.missingCommand': [now],
      'billing.paymentFailed': [now - 2000],
      'inbox.manyMessages': [now - 1000],
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
    defineLaunchableState('inbox.manyMessages', {
      label: 'Many messages',
      launch: vi.fn(),
    }),
  ])

  mountStateLauncher({ initiallyOpen: true })
  await nextRender()
  const shadowRoot = getLauncherShadowRoot()
  const groups = [...shadowRoot!.querySelectorAll<HTMLElement>('section section')]

  expect(groups.map((group) => group.querySelector('h3')?.textContent)).toEqual([
    'Recent',
    'billing',
  ])
  expect(
    [...groups[0]!.querySelectorAll('[role="option"]')].map(
      (command) => command.querySelector('span')?.textContent,
    ),
  ).toEqual(['Many messages', 'Payment failed'])
  expect(getCommandLabels()).toEqual(['Many messages', 'Payment failed', 'Empty invoices'])

  const search = shadowRoot?.querySelector<HTMLInputElement>('input[type="search"]')
  search!.value = 'billing'
  search!.dispatchEvent(new InputEvent('input', { bubbles: true }))
  await nextRender()

  expect(shadowRoot?.textContent).not.toContain('Recent')
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

test('shows pending launch feedback and prevents duplicate activation', async () => {
  let finishLaunch: (() => void) | undefined
  const launch = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishLaunch = resolve
      }),
  )
  registerLaunchableState([
    defineLaunchableState('billing.paymentFailed', {
      label: 'Payment failed',
      launch,
    }),
  ])

  mountStateLauncher({ initiallyOpen: true })
  const shadowRoot = getLauncherShadowRoot()
  const command = shadowRoot?.querySelector<HTMLButtonElement>('[role="option"]')

  command?.click()
  await nextRender()

  expect(command?.disabled).toBe(true)
  expect(command?.getAttribute('aria-busy')).toBe('true')
  expect(command?.querySelector('[aria-hidden="true"]')).toBeTruthy()
  expect(shadowRoot?.querySelector('[role="status"]')?.textContent).toBe(
    'Launching Payment failed…',
  )

  command?.click()
  expect(launch).toHaveBeenCalledOnce()

  finishLaunch?.()
  await nextRender()

  expect(shadowRoot?.querySelector('[role="dialog"]')).toBeNull()
})

test('blurs the filter and hides the launcher after launching with keyboard', async () => {
  const blur = vi.spyOn(HTMLInputElement.prototype, 'blur')
  const launch = vi.fn()
  registerLaunchableState([
    defineLaunchableState('billing.paymentFailed', {
      label: 'Payment failed',
      launch,
    }),
    defineLaunchableState('inbox.manyMessages', {
      label: 'Many messages',
      launch: vi.fn(),
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
  expect(blur).toHaveBeenCalledOnce()
  expect(getLauncherShadowRoot()?.querySelector('[role="dialog"]')).toBeNull()
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
  expect(shadowRoot?.querySelector('[role="dialog"]')).toBeNull()
})

test('allows the search input to blur during mobile command activation', async () => {
  const focus = vi.spyOn(HTMLInputElement.prototype, 'focus')
  const launch = vi.fn()
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true })),
  )
  registerLaunchableState([
    defineLaunchableState('billing.paymentFailed', {
      label: 'Payment failed',
      launch,
    }),
  ])

  mountStateLauncher({ initiallyOpen: true })
  await nextRender()
  const shadowRoot = getLauncherShadowRoot()
  const search = shadowRoot?.querySelector<HTMLInputElement>('input[type="search"]')
  const command = shadowRoot?.querySelector<HTMLButtonElement>('[role="option"]')
  const pointerDown = new PointerEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    pointerType: 'touch',
  })

  command!.dispatchEvent(pointerDown)
  search!.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }))
  command!.click()
  await nextRender()

  expect(pointerDown.defaultPrevented).toBe(false)
  expect(launch).toHaveBeenCalledOnce()
  expect(focus).toHaveBeenCalledOnce()
  expect(shadowRoot?.querySelector('[role="dialog"]')).toBeNull()
})

test('keeps the launcher open when a command fails to launch', async () => {
  registerLaunchableState([
    defineLaunchableState('billing.paymentFailed', {
      label: 'Payment failed',
      launch() {
        throw new Error('Launch failed')
      },
    }),
  ])

  mountStateLauncher({ initiallyOpen: true })
  const shadowRoot = getLauncherShadowRoot()

  shadowRoot?.querySelector<HTMLButtonElement>('[role="option"]')?.click()
  await nextRender()

  expect(shadowRoot?.querySelector('[role="dialog"]')).toBeTruthy()
  expect(shadowRoot?.querySelector('[role="alert"]')?.textContent).toBe('Launch failed')
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

function createTestVisualViewport(height: number, offsetTop: number) {
  return Object.assign(new EventTarget(), {
    height,
    offsetTop,
  })
}

async function nextRender() {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}
