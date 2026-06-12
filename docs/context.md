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
- Re-defining the same id returns the same command object and updates its registry record.
- Empty ids are invalid.

A common pattern is to define exported command handles in one module and attach handlers near the application code that owns the relevant state transition.

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
import { defineLaunchableState } from 'state-launcher'
import { paymentFailed } from './launchable-states'

defineLaunchableState(paymentFailed.id, {
  label: 'Payment failed',
  async launch() {
    await setupBillingFailure()
  },
})
```

## Lifecycle and cleanup

The registry is process-local. Commands remain registered until they are unregistered or the registry is cleared.

Use:

- `unregisterCommand(commandOrId)` to remove one command.
- `clearCommands()` to reset the registry, especially between tests.
- `mountStateLauncher(...).unmount()` to remove the UI while leaving command records intact.

Mounted launchers subscribe to registry changes. Clearing commands while a launcher is mounted updates the panel to show the empty registry.

## Launch handlers

A command can exist before it has a handler. In the launcher UI, commands without handlers are shown as disabled and ranked below commands that can be launched. Programmatic attempts to launch a command without a handler reject with an error. This lets shared modules export command handles without importing app setup code.

Handlers may be synchronous or async. Errors thrown by handlers propagate to programmatic callers and are shown in the panel when launched from the UI.

## API selection

Use the root entrypoint for framework-neutral registration, launching, cleanup, and mounting:

```ts
import {
  clearCommands,
  defineLaunchableState,
  launchCommand,
  mountStateLauncher,
  unregisterCommand,
} from 'state-launcher'
```

Use `state-launcher/preact` only when a Preact component should own a handler lifetime:

```tsx
import { useLaunchableState } from 'state-launcher/preact'
```

The hook attaches the handler on mount/update and removes that exact handler during cleanup. It does not own labels, descriptions, or tags.

## Launcher UI behavior

`mountStateLauncher` mounts a Shadow DOM-isolated floating launcher. It supports:

- `bottom-right`, `bottom-left`, `top-right`, and `top-left` positions
- custom panel title
- initially open or closed state
- fuzzy filtering across id, label, description, and tags, with launchable commands ranked first
- keyboard navigation with arrow keys and Enter
- error display for failed launches

The returned controller can `open`, `close`, `toggle`, and `unmount` the launcher.
