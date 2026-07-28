# state-launcher context

`state-launcher` models launchable application states as named commands. A command is a stable id plus optional display metadata and an optional launch handler.

The package intentionally separates discovery from behavior:

- The launcher panel discovers registered commands, groups them by id prefix, filters them, and reports launch errors.
- The host application decides what each command actually does.
- Tests and setup scripts can launch the same commands without mounting the panel.

## Command identity

Use stable, dotted ids such as `billing.paymentFailed` or `inbox.manyMessages`.

- The full id is the command identity.
- The first dotted segment is used as the panel group name.
- Defining a command creates a side-effect-free handle that can carry metadata and an optional launch handler.
- Registering commands makes them discoverable by the launcher. Duplicate ids are merged into one registry record.
- Empty ids are invalid.

A common pattern is to define exported command handles in one module and register the commands from a dev-only entrypoint.

```ts
// launchable-states.ts
import { defineLaunchableState } from 'state-launcher'

export const paymentFailed = defineLaunchableState('billing.paymentFailed', {
  label: 'Payment failed',
  tags: ['billing', 'card'],
})
```

```ts
// billing-debug.ts
import { registerLaunchableState } from 'state-launcher'
import { paymentFailed } from './launchable-states'

const unregisterStates = registerLaunchableState([paymentFailed])

import.meta.hot?.dispose(unregisterStates)
```

## Lifecycle and cleanup

The registry is process-local. Command handles are plain values; the launcher only discovers commands after they are registered. Registered commands remain in the launcher registry until they are unregistered or the registry is cleared.

Use:

- `registerLaunchableState(commands)` to make command handles visible to the launcher.
- `clearActiveState()` to abort the active launch and run its cleanup functions without unregistering commands.
- `unregisterCommand(commandOrId)` to remove one command.
- `clearCommands()` to reset the registry, especially between tests.
- `mountStateLauncher(...).unmount()` to remove the UI while leaving command records intact.

`registerLaunchableState` returns an idempotent cleanup function. HMR modules should pass that cleanup to `import.meta.hot.dispose()` so commands from the old module instance are removed before the replacement module registers its list. The cleanup only removes that registration call's contribution; newer duplicate-id registrations and handlers attached elsewhere are preserved.

Mounted launchers subscribe to registry changes. Clearing commands while a launcher is mounted updates the panel to show the empty registry.

Successful launches are retained in browser local storage for 24 hours. With an empty search, the launcher surfaces up to three registered commands with the latest launches in a leading Recent group. Stale history for unregistered commands is not displayed. During search, launch frequency remains a ranking hint instead of a separate group.

## Launch handlers

A command can exist before it has a handler. In the launcher UI, registered commands without handlers are shown as disabled and ranked below commands that can be launched. Programmatic attempts to launch a command without a handler reject with an error. This lets shared modules export command handles without importing app setup code.

A command can have multiple launch handlers. `defineLaunchableState` accepts one initial handler for convenience, and additional handlers can be attached from anywhere, including component lifecycles. Launch order is intentionally not part of the API contract.

When a command is launched, it becomes the active state. If a handler is attached later for the active command, that handler fires immediately. This lets conditional rendering continue a launchable state as newly mounted code becomes available.

Handlers receive a context with an `AbortSignal`. The signal aborts when a different command id becomes active or the active command is cleared. Use it to cancel stale async setup, such as server-side fake-scenario creation, when another state is launched before setup finishes.

Handlers can call `defer(cleanup)` as each setup resource is acquired. Deferred cleanups run in reverse registration order for that handler when a different command id becomes active or the active state is cleared. If the handler throws, its deferred cleanups run before the launch error propagates. Successful handler cleanups remain owned by the active state. Registering cleanup after the signal has already aborted starts that cleanup immediately, and every registration runs at most once.

Handlers may also return one cleanup function. A returned cleanup behaves as that handler's final registration, so it runs before cleanups deferred earlier by the same handler. Relaunching the same command id does not run cleanup; each invocation contributes another cleanup scope to the existing active state. Ordering between different handlers is intentionally unspecified.

Cleanup callbacks may be async. State transitions and `clearActiveState()` await cleanup known to those operations. Synchronous registry-removal operations such as `unregisterCommand()` and `clearCommands()` start cleanup but do not await async completion. A cleanup registered after an earlier teardown has already completed likewise starts immediately but cannot extend the completed operation.

Handlers may be synchronous or async. Errors thrown by handlers propagate to programmatic callers and are shown in the panel when launched from the UI.

## API selection

Use the root entrypoint for framework-neutral registration, launching, cleanup, and mounting:

```ts
import {
  clearActiveState,
  clearCommands,
  defineLaunchableState,
  launchCommand,
  mountStateLauncher,
  registerLaunchableState,
  unregisterCommand,
} from 'state-launcher'
```

Use `state-launcher/react` when a React component should own a handler lifetime:

```tsx
import { useLaunchableState } from 'state-launcher/react'

const command = useLaunchableState('billing.paymentFailed', {
  label: 'Payment failed',
  launch: ({ signal }) => showFailedPayment({ signal }),
})
```

This local-definition form returns a stable command handle, makes it
discoverable while the component is mounted, uses the latest render's handler,
and removes its registration and handler on unmount. Metadata initializes when
the handle is created.

For a state with handlers in multiple components, define one command in their
nearest shared parent module and attach it from each owner:

```tsx
useLaunchableState(sharedPaymentFailedCommand, ({ signal }) => showFailedPayment({ signal }))
```

Use `state-launcher/preact` when a Preact component should own a handler lifetime:

```tsx
import { useLaunchableState } from 'state-launcher/preact'
```

Both framework entry points attach one handler with the component lifetime,
register the command for launcher discovery, and remove that exact handler
during cleanup. The React hook additionally supports local definitions and
calls updated handlers without reattaching the registry handler.

## Launcher UI behavior

`mountStateLauncher` mounts a Shadow DOM-isolated floating launcher panel. It supports:

- fixed `bottom-right`, `bottom-left`, `top-right`, and `top-left` positions on desktop widths above `1024px`
- a fullscreen bottom drawer at `1024px` and below; `position` still selects the corner used when the viewport grows beyond the breakpoint
- a safe-area-aware strip above the mobile/tablet drawer that closes it when tapped
- swipe-down dismissal from the pill above the drawer title, with slide-in and slide-out transitions
- custom panel title
- initially open or closed state
- an optional compact pathname bar with home and editable navigation controls
- an optional sign-out/sign-in toggle initialized by `auth.isSignedIn` and backed by paired `auth.onSignOut` and `auth.onSignIn` handlers
- fuzzy filtering across id, label, description, and tags, with launchable commands ranked first, contributing text highlighted, and matching tags revealed
- keyboard navigation with arrow keys and Enter
- error display for failed launches

The returned controller can `open`, `close`, `toggle`, and `unmount` the launcher.
The package does not render a persistent trigger; applications wire their own
button, menu item, keyboard shortcut, or test helper to the returned controller.
