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

This example proves the core workflow: define a stable command id once, attach behavior from app code, mount the isolated panel, and still launch the same command without the panel.

```ts
import { defineLaunchableState, mountStateLauncher } from 'state-launcher'

export const paymentFailed = defineLaunchableState('billing.paymentFailed', {
  label: 'Payment failed',
  description: 'Customer has a failed payment method.',
  tags: ['billing', 'card'],
})

// Later, in code that knows how to create this state:
defineLaunchableState(paymentFailed.id, {
  label: 'Payment failed',
  async launch() {
    await signInAsTestUser()
    await createFailedPaymentMethod()
    await navigateToBilling()
  },
})

const launcher = mountStateLauncher({
  target: document.body,
  initiallyOpen: false,
  position: 'bottom-right',
  title: 'App states',
})

await paymentFailed.launch()
launcher.toggle()
```

## Preact lifecycle hook

Use `state-launcher/preact` when a component owns the handler lifetime. Metadata still belongs on `defineLaunchableState`; the hook only attaches and detaches the launch handler.

```tsx
import { useLaunchableState } from 'state-launcher/preact'
import { paymentFailed } from './launchable-states'

export function BillingDebugState() {
  useLaunchableState(paymentFailed, async () => {
    await signInAsTestUser()
    await createFailedPaymentMethod()
    await navigateToBilling()
  })

  return null
}
```

## Documentation map

- [`docs/context.md`](docs/context.md): concepts, lifecycle, command identity, and API-selection guidance.
- [`examples/main.ts`](examples/main.ts): runnable demo registration, filtering, command chaining, and error display.
- Type declarations from the package are the exact API reference.

Run the local demo with:

```sh
pnpm demo
```
