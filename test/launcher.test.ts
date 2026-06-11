import { mountStateLauncher } from '../src/index'

afterEach(() => {
  document.body.replaceChildren()
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
