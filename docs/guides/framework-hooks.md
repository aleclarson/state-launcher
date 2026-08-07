# Framework Hooks

> Attach one launch handler to a React or Preact component lifetime without changing the shared command registry.

Define command metadata with `defineLaunchableState`, then use a framework entry
point to attach and detach handlers as components mount and unmount. The hooks
reuse the same registry as the browser and headless surfaces.

## React

For a command owned by one component, define it through the React hook:

```tsx
import { useLaunchableState } from 'state-launcher/react'

export function BillingDebugState() {
  const paymentFailed = useLaunchableState('billing.paymentFailed', {
    label: 'Payment failed',
    tags: ['billing', 'card'],
    async launch({ signal }) {
      await showFailedPayment({ signal })
    },
  })

  return <button onClick={() => paymentFailed.launch()}>Preview payment failure</button>
}
```

The returned handle is stable across rerenders. The command is discoverable only
while the component is mounted, and the latest render's handler is used.

When several components contribute handlers to one command, define the command
in their shared module and attach it from each owner:

```tsx
import { useLaunchableState } from 'state-launcher/react'
import { paymentFailed } from './launchable-states'

export function BillingDebugState() {
  useLaunchableState(paymentFailed, ({ signal }) => showFailedPayment({ signal }))
  return null
}
```

## Preact

The Preact hook attaches a handler to an existing command for the component's
lifetime:

```tsx
import { useLaunchableState } from 'state-launcher/preact'
import { paymentFailed } from './launchable-states'

export function BillingDebugState() {
  useLaunchableState(paymentFailed, ({ signal }) => showFailedPayment({ signal }))
  return null
}
```

Each hook removes only its own handler during cleanup. Multiple handlers may
share one command; their invocation order is intentionally not part of the API.

## Choose a hook or a static registration

Use a hook when handler availability follows a component lifetime. Use
`registerLaunchableState()` when a development entry point should expose a
command independently of component mounting. Both approaches remain visible to
`state-launcher/headless` subscriptions.

For handler context, abort, and cleanup behavior, read
[lifecycle and ownership](../concepts/lifecycle.md).
