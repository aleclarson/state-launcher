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
- `unregisterCommand(commandOrId)` to remove one command.
- `clearCommands()` to reset the registry, especially between tests.
- `mountStateLauncher(...).unmount()` to remove the UI while leaving command records intact.

`registerLaunchableState` returns an idempotent cleanup function. HMR modules should pass that cleanup to `import.meta.hot.dispose()` so commands from the old module instance are removed before the replacement module registers its list. The cleanup only removes that registration call's contribution; newer duplicate-id registrations and handlers attached elsewhere are preserved.

Mounted launchers subscribe to registry changes. Clearing commands while a launcher is mounted updates the panel to show the empty registry.

## Launch handlers

A command can exist before it has a handler. In the launcher UI, registered commands without handlers are shown as disabled and ranked below commands that can be launched. Programmatic attempts to launch a command without a handler reject with an error. This lets shared modules export command handles without importing app setup code.

A command can have multiple launch handlers. `defineLaunchableState` accepts one initial handler for convenience, and additional handlers can be attached from anywhere, including component lifecycles. Launch order is intentionally not part of the API contract.

When a command is launched, it becomes the active state. If a handler is attached later for the active command, that handler fires immediately. This lets conditional rendering continue a launchable state as newly mounted code becomes available.

Handlers receive a context with an `AbortSignal`. The signal aborts when a different command id becomes active or the active command is cleared. Use it to cancel stale async setup, such as server-side fake-scenario creation, when another state is launched before setup finishes.

Handlers may return cleanup functions. Returned cleanup functions run when a different command id becomes active, before the new state's launch handlers run. Relaunching the same command id does not run cleanup; the state is cleaned up when the launcher moves to another state. If an aborted handler eventually returns a cleanup function, the launcher runs it immediately instead of retaining it for the new active state.

Handlers may be synchronous or async. Errors thrown by handlers propagate to programmatic callers and are shown in the panel when launched from the UI.

## API selection

Use the root entrypoint for framework-neutral registration, launching, cleanup, and mounting:

```ts
import {
  clearCommands,
  defineLaunchableState,
  launchCommand,
  mountStateLauncher,
  registerLaunchableState,
  unregisterCommand,
} from 'state-launcher'
```

Use `state-launcher/preact` only when a Preact component should own a handler lifetime:

```tsx
import { useLaunchableState } from 'state-launcher/preact'
```

The hook attaches one handler on mount/update, registers the command for launcher discovery, and removes that exact handler during cleanup. Metadata still comes from the command handle.

## Launcher UI behavior

`mountStateLauncher` mounts a Shadow DOM-isolated floating launcher panel. It supports:

- fixed `bottom-right`, `bottom-left`, `top-right`, and `top-left` positions on desktop widths above `1024px`
- viewport-centered positioning at `1024px` and below; `position` still selects the corner used when the viewport grows beyond the breakpoint
- 16px mobile/tablet viewport spacing plus safe-area insets, with a constrained panel height and a scrolling command list
- custom panel title
- initially open or closed state
- fuzzy filtering across id, label, description, and tags, with launchable commands ranked first
- keyboard navigation with arrow keys and Enter
- error display for failed launches

The returned controller can `open`, `close`, `toggle`, and `unmount` the launcher.
The package does not render a persistent trigger; applications wire their own
button, menu item, keyboard shortcut, or test helper to the returned controller.
