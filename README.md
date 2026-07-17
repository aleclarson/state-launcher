# state-launcher

`state-launcher` is a dev/test-only command launcher for putting an application into named states from an isolated in-page panel.

Use it when you want QA, designers, or developers to jump directly to states such as `billing.paymentFailed` or `inbox.manyMessages` without wiring those states into production navigation.

## Fit

Use this package if you need:

- a small browser UI for launching registered app states during development or tests
- command definitions that can live separately from the code that knows how to enter a state
- direct programmatic launching for tests or setup scripts
- Shadow DOM style isolation so the launcher does not inherit app CSS
- a Preact lifecycle hook for attaching launch handlers while components are mounted

Do not use it if you need:

- production feature flags, routing, or end-user navigation
- persisted history, acknowledgements, parameters, or event inspection
- mock-server orchestration or data seeding built into the package
- framework integrations beyond the exported Preact hook

## Requirements and tradeoff

`state-launcher` is browser-only, ESM-only, and currently depends on Preact, `@preact/signals`, `isolet-js`, and `fuzzysort2`.

The main tradeoff is explicit host ownership: the launcher owns discovery, filtering, UI, lifecycle cleanup, disabled display for commands without handlers, and error display, but your application owns every state transition. That keeps the package small and framework-light, but it means you must register realistic handlers wherever your app already has the knowledge to build those states.

## Install

```sh
pnpm add state-launcher
```

## Minimal example

This example proves the core workflow: define stable command handles, register the
ones that should appear in the launcher, mount the isolated panel, and still
launch the same command without opening the panel.

```ts
import { defineLaunchableState, mountStateLauncher, registerLaunchableState } from 'state-launcher'

export const paymentFailed = defineLaunchableState('billing.paymentFailed', {
  label: 'Payment failed',
  description: 'Customer has a failed payment method.',
  tags: ['billing', 'card'],
  async launch() {
    await signInAsTestUser()
    await createFailedPaymentMethod()
    await navigateToBilling()
  },
})

const unregisterStates = registerLaunchableState([paymentFailed])

import.meta.hot?.dispose(unregisterStates)

const launcher = mountStateLauncher({
  target: document.body,
  initiallyOpen: false,
  position: 'bottom-right',
  title: 'App states',
})

document.querySelector('#open-state-launcher')?.addEventListener('click', () => {
  launcher.toggle()
})

await paymentFailed.launch()
```

`position` selects one of four fixed desktop corners. At viewport widths of
`1024px` and below, the package centers the panel in the visual viewport instead,
regardless of the selected corner. The centered panel keeps 16px of safe spacing,
accounts for device safe-area insets, and scrolls its command list when viewport
height is limited. No consumer Shadow DOM overrides are needed.

`mountStateLauncher()` does not render its own persistent trigger. Use the
returned controller to wire the launcher to an app-owned button, menu item,
keyboard shortcut, or test helper.

`defineLaunchableState()` is annotated as side-effect free, and the package marks
its modules as side-effect free for bundlers. Keep `registerLaunchableState()`
and `mountStateLauncher()` in dev-only code paths when you want production
bundles to drop launchable-state definitions.

`registerLaunchableState()` returns an idempotent cleanup function. Pass it to
`import.meta.hot.dispose()` when registering from a Vite HMR module so stale
commands from the previous module instance are removed before the replacement
module registers its command list.

## Preact lifecycle hook

Use `state-launcher/preact` when a component owns one launch handler's lifetime.
Metadata still belongs on `defineLaunchableState`; the hook only attaches and
detaches its handler.

```tsx
import { useLaunchableState } from 'state-launcher/preact'
import { paymentFailed } from './launchable-states'

export function BillingDebugState() {
  useLaunchableState(paymentFailed, async ({ signal }) => {
    await signInAsTestUser({ signal })
    await createFailedPaymentMethod({ signal })
    await navigateToBilling()
  })

  return null
}
```

A command may have multiple launch handlers. Launch order is intentionally not
part of the API contract. When a command is launched, it becomes the active
state; handlers attached later for the active command fire immediately so
conditional UI can continue entering that state as it mounts.

Launch handlers may return a cleanup function. Cleanup functions run when a
different command id is activated, before the new state's launch handlers run.
That lets a launched state undo temporary setup when the launcher moves to
another state.

Launch handlers receive a context with an `AbortSignal`. The signal aborts when
another command id is activated or the active command is cleared, so async setup
can cancel stale work. If an aborted handler eventually returns a cleanup
function, the launcher runs it immediately instead of retaining it for the new
active state.

## Documentation map

- [`docs/context.md`](docs/context.md): concepts, lifecycle, command identity, and API-selection guidance.
- [`examples/main.ts`](examples/main.ts): runnable demo registration, filtering, command chaining, and error display.
- Type declarations from the package are the exact API reference.

Run the local demo with:

```sh
pnpm demo
```

Run the launcher UI playground with:

```sh
pnpm playground
```
