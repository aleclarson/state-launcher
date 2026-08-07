# state-launcher

`state-launcher` is a dev/test-only command launcher for putting an application
into named states such as `billing.paymentFailed` or `inbox.manyMessages`.

The package keeps command registration and state transitions in the application.
You can provide its browser panel to developers, or use the same
registry through the headless API when another development surface should
render the catalog.

## Choose a surface

| Surface          | Use it when                                               | It provides                                                                                 |
| ---------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Browser launcher | Developers or QA need an in-page command panel.           | Shadow DOM-isolated UI, search, route-aware ranking, recent commands, errors, and Clear.    |
| Headless API     | An external development surface owns the command browser. | Serializable snapshots, change subscriptions, id-based launches, and active-state clearing. |

Both surfaces use the same singleton registry, launch handlers, abort signals,
cleanup functions, and active-state transitions. The headless entry point does
not mount the panel or import its Preact UI.

## Fit and boundaries

Use State Launcher for development tools, QA workflows, test setup, and
component-owned launch handlers. Do not use it for production navigation,
feature flags, end-user state, cross-device history, mock-server orchestration,
or data seeding.

The package is ESM. The browser panel uses Preact and requires a browser DOM;
the React hook uses the optional React peer dependency. The headless bundle has
no DOM-mounting or Preact runtime path, but commands still need to be registered
and handled by the application that owns the state transitions.

## Browser example

This example defines one stable command, registers it for discovery, mounts the
panel, and launches the same command programmatically:

```ts
import { defineLaunchableState, mountStateLauncher, registerLaunchableState } from 'state-launcher'

const paymentFailed = defineLaunchableState('billing.paymentFailed', {
  label: 'Payment failed',
  description: 'Show the billing surface with a failed payment method.',
  tags: ['billing', 'card'],
  launch() {
    document.body.dataset.debugState = 'billing.paymentFailed'
  },
})

const unregister = registerLaunchableState([paymentFailed])
import.meta.hot?.dispose(unregister)

const launcher = mountStateLauncher({ title: 'App states' })
document.querySelector('#open-state-launcher')?.addEventListener('click', () => {
  launcher.toggle()
})

await paymentFailed.launch()
```

## Headless example

Use the dedicated entry point when a consumer needs records and commands
without mounting the browser panel:

```ts
import {
  clearActiveState,
  getStateLauncherSnapshot,
  launchStateLauncherCommand,
  subscribeStateLauncher,
} from 'state-launcher/headless'

const publishCatalog = (snapshot: ReturnType<typeof getStateLauncherSnapshot>) => {
  console.log(JSON.stringify(snapshot))
}

publishCatalog(getStateLauncherSnapshot())
const unsubscribe = subscribeStateLauncher(publishCatalog)

await launchStateLauncherCommand('billing.paymentFailed')
await clearActiveState()
unsubscribe()
```

## Documentation

- [Public docs home](docs/index.md)
- [Getting started](docs/getting-started.md)
- [Browser launcher guide](docs/guides/browser-launcher.md)
- [Headless API guide](docs/guides/headless-controller.md)
- [Lifecycle and ownership](docs/concepts/lifecycle.md)
- Generated API pages for the root, React, Preact, and headless entry points are
  produced by lildocs from the package declarations.

Build or preview the docs with:

```sh
pnpm docs:build
pnpm docs:dev
```
