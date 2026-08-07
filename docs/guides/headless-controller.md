# Headless API

> Expose the registered command catalog to an external development surface without mounting the browser launcher.

The headless entry point is an additional API surface, not a second registry.
It does not mount the browser panel and does not import Preact, Shadow DOM, or
DOM rendering code. Define and register commands through the root entry point,
then read and control those same records through `state-launcher/headless`.

## Subscribe to the catalog

```ts
import { defineLaunchableState, registerLaunchableState } from 'state-launcher'
import { getStateLauncherSnapshot, subscribeStateLauncher } from 'state-launcher/headless'

const paymentFailed = defineLaunchableState('billing.paymentFailed', {
  label: 'Payment failed',
  description: 'Show a failed payment method.',
  tags: ['billing', 'card'],
  launch() {
    navigateToBilling()
  },
})

const unregister = registerLaunchableState([paymentFailed])
import.meta.hot?.dispose(unregister)

const publishCatalog = (snapshot: ReturnType<typeof getStateLauncherSnapshot>) => {
  console.log(JSON.stringify(snapshot))
}

publishCatalog(getStateLauncherSnapshot())
const unsubscribe = subscribeStateLauncher(publishCatalog)
```

The subscription does not call its listener immediately. Read the initial
snapshot before subscribing when a consumer needs a catalog on startup. Each
callback receives a new sorted array and new metadata arrays, so changing a
received snapshot cannot mutate the registry.

The listener runs after registered commands, handler availability, or committed
active-state status changes. Unsubscribe when updates are no longer needed.

## Snapshot records

Every record is JSON-serializable and contains no command handle, callback, or
internal registry object:

| Field              | Shape                 | Meaning                                              |
| ------------------ | --------------------- | ---------------------------------------------------- |
| `id`               | `string`              | Stable id used to launch the command.                |
| `label`            | `string \| undefined` | Optional display label.                              |
| `description`      | `string \| undefined` | Optional display description.                        |
| `tags`             | `readonly string[]`   | Searchable metadata, copied into the snapshot.       |
| `routes`           | `readonly string[]`   | Normalized pathname patterns used by the browser UI. |
| `hasLaunchHandler` | `boolean`             | Whether at least one handler is currently available. |
| `isActive`         | `boolean`             | Whether this is the committed active state.          |

The snapshot intentionally describes what a consumer may display; it does not
make the consumer responsible for state transitions or cleanup.

## Launch and clear by id

```ts
import { clearActiveState, launchStateLauncherCommand } from 'state-launcher/headless'

try {
  await launchStateLauncherCommand('billing.paymentFailed')
} catch (error) {
  reportCommandError(error)
}

await clearActiveState()
unsubscribe()
```

`launchStateLauncherCommand(id)` resolves after every registered handler for the
id resolves and the active launch is committed. It rejects for an unknown id,
a command without a handler, a handler failure, cleanup failure, or an aborted
launch. `clearActiveState()` aborts the active `AbortSignal`, runs registered
cleanup functions, and resolves after known async cleanup finishes without
unregistering the command.

When a second id is launched, the previous active state remains committed until
its teardown completes. The subscription then reports no active state while the
new setup is pending, followed by the new active record after setup succeeds.

## Keep surrounding concerns outside this package

The headless API deliberately stops at snapshots, stable ids, and lifecycle
promises. What consumes those values and how they connect to the rest of an
application are outside this package. The headless API does not provide
production navigation or an end-user state schema.

For the cleanup and abort rules that apply to both surfaces, read
[lifecycle and ownership](../concepts/lifecycle.md). For generated signatures,
see the [headless API reference](../reference/state-launcher/headless.md).
