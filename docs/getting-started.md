# Getting Started

> Register one stable command, choose the browser or headless surface, and verify that the host application still owns the state transition.

## Install

```sh
pnpm add state-launcher
```

State Launcher is ESM and intended for browser or WebView development builds.
The browser panel requires Preact. The React hook requires React; the React peer
dependency is optional when the hook is not used.

## Define and register a command

Define commands wherever their metadata and state behavior belong, then register
them from a development-only entry point:

```ts
// launchable-states.ts
import { defineLaunchableState } from 'state-launcher'

export const paymentFailed = defineLaunchableState('billing.paymentFailed', {
  label: 'Payment failed',
  description: 'Show a failed payment method in the billing surface.',
  tags: ['billing', 'card'],
  routes: ['/billing/*'],
  async launch({ signal }) {
    await createFailedPaymentMethod({ signal })
    await navigateToBilling()
  },
})
```

```ts
// debug-launcher.ts
import { registerLaunchableState } from 'state-launcher'
import { paymentFailed } from './launchable-states'

const unregister = registerLaunchableState([paymentFailed])
import.meta.hot?.dispose(unregister)
```

Registration makes a command discoverable. A command without a currently
available handler remains visible but cannot be launched.

> [!IMPORTANT]
> Keep `registerLaunchableState()` and the surface you mount in a development or test path when production bundles should remove the launcher integration.

## Choose the surface

For a browser panel, mount the launcher from the same development entry point:

```ts
import { mountStateLauncher } from 'state-launcher'

const launcher = mountStateLauncher({
  initiallyOpen: false,
  title: 'App states',
})

document.querySelector('#open-state-launcher')?.addEventListener('click', () => {
  launcher.toggle()
})
```

For a host-owned command browser, import `state-launcher/headless` instead. The
headless surface reads the commands already registered in the same WebView;
registration still comes from the root entry point. Continue with the
[headless controller guide](guides/headless-controller.md).

## Verify a launch

The command handle and the root `launchCommand()` function both use the same
registry:

```ts
import { launchCommand } from 'state-launcher'

await paymentFailed.launch()
await launchCommand('billing.paymentFailed')
```

Both calls reject when the id is unknown, no handler is available, setup fails,
or cleanup fails. A successful launch becomes the active state only after its
handlers resolve.

## Next steps

- Configure the panel in the [browser launcher guide](guides/browser-launcher.md).
- Connect a host catalog in the [headless controller guide](guides/headless-controller.md).
- Attach handlers to component lifetimes with the [framework hooks guide](guides/framework-hooks.md).
- Read [lifecycle and ownership](concepts/lifecycle.md) before composing multiple handlers or async cleanup.
