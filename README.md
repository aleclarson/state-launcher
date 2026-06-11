# state-launcher

Dev/test-only launcher UI for registering and launching named application states from an isolated in-page panel.

```sh
pnpm add state-launcher
```

## Usage

Mount the launcher once from dev-only application setup:

```ts
import { mountStateLauncher } from 'state-launcher'

const launcher = mountStateLauncher({
  target: document.body,
  initiallyOpen: false,
  position: 'bottom-right',
  title: 'Commands',
})

launcher.open()
launcher.close()
launcher.toggle()
launcher.unmount()
```

Define shared command symbols in a dedicated module:

```ts
import { defineLaunchableState } from 'state-launcher'

export const billingPaymentFailed = defineLaunchableState('billing.paymentFailed', {
  label: 'Payment failed',
  description: 'Customer has a failed payment method.',
  tags: ['billing', 'card'],
})

export const inboxManyMessages = defineLaunchableState('inbox.manyMessages', {
  label: 'Many messages',
})
```

Attach behavior where the host application knows how to enter that state:

```ts
import { defineLaunchableState } from 'state-launcher'
import { billingPaymentFailed, inboxManyMessages } from './commands'

defineLaunchableState(billingPaymentFailed.id, {
  label: 'Payment failed',
  description: 'Customer has a failed payment method.',
  tags: ['billing', 'card'],
  async launch() {
    await setupBillingFailure()
    await inboxManyMessages.launch()
  },
})
```

Commands can also launch without the visual panel:

```ts
await billingPaymentFailed.launch()
```

## Preact

`state-launcher/preact` provides a lifecycle hook for Preact applications. It attaches only the launch handler while the component is mounted. Labels, descriptions, and tags still belong to `defineLaunchableState`.

```ts
import { useLaunchableState } from 'state-launcher/preact'
import { billingPaymentFailed } from './commands'

export function BillingDebugCommands() {
  useLaunchableState(billingPaymentFailed, async () => {
    await setupBillingFailure()
  })

  return null
}
```

## Demo

Run the local demo:

```sh
pnpm demo
```

Open the URL printed by Vite. The demo registers billing and inbox commands, supports filtering, launches a successful command, and includes one command that reports an error in the panel.

## MVP Scope

The launcher owns UI. The host application owns behavior. This package does not create product states itself.

Included in the MVP:

- Shadow DOM-isolated launcher UI
- floating launcher button and panel
- programmatic command definition and launching
- grouped command list based on id prefix
- fuzzy filtering with `fuzzysort2`
- keyboard navigation and activation
- launch error display in the panel
- unmount API
- TypeScript types
- `state-launcher/preact` hook

Intentionally out of scope for the first version:

- persistence
- history
- command acknowledgements
- complex params
- event inspection
- mock-server integrations
- drag or resize
- framework-specific host integrations beyond the basic Preact hook
