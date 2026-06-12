# state-launcher Concept

## Summary

`state-launcher` is a small dev/test-only package for registering and launching named application states from an isolated in-page UI.

It provides:

- a Shadow DOM-isolated launcher UI
- a programmatic API for application code to define, register, and launch commands
- a simple activation protocol for launching a registered application state

The package does **not** create product states itself. Application code owns what each state means and how it is applied.

## Core Principle

The launcher owns UI. The host application owns behavior.

```txt
state-launcher:
  "The user launched billing.paymentFailed."

host application:
  "Here is how this app enters billing.paymentFailed."
```

## Technology Choices

The initial package should use:

- `isolet-js` for Shadow DOM isolation
- `preact` for the bundled UI
- `@preact/signals` for UI state
- CSS modules for styling
- `vite` for bundling the UI/package
- `fuzzysort2` for filtering registered commands

## MVP Scope

The first version should include only the bare necessities:

- Shadow DOM isolated mount
- floating launcher button
- open/close panel
- programmatic launchable state definition
- programmatic state launching through `command.launch()`
- granular launch handler registration through launchable state definitions/hooks
- basic Preact launchable state hooks from `state-launcher/preact`
- registered command list grouped by command id prefix
- fuzzy filtering with `fuzzysort2`
- keyboard navigation for the filtered command list
- command activation
- unmount API
- exported constants and TypeScript types
- `state-launcher/preact` submodule exports

The first version should not include persistence, history, command acknowledgements, complex params, event inspection, mock-server integrations, drag/resize, or framework-specific host integrations.

## Public API

Application code mounts the launcher once:

```ts
import { mountStateLauncher, registerLaunchableState } from 'state-launcher'
import { billingPaymentFailed, inboxManyMessages } from './debug/commands'

registerLaunchableState([billingPaymentFailed, inboxManyMessages])

const launcher = mountStateLauncher({
  target: document.body,
  initiallyOpen: false,
  position: 'bottom-right',
})

launcher.unmount()
```

Application code defines launchable state symbols in a dedicated module so they can be imported by registration code, tests, and other commands that need command chaining. The prefix before the first `.` is used as the UI group:

```ts
// src/debug/commands.ts
import { defineLaunchableState } from 'state-launcher'

export const billingPaymentFailed = defineLaunchableState('billing.paymentFailed')
export const inboxManyMessages = defineLaunchableState('inbox.manyMessages')
```

Application code can attach a launch handler when defining a launchable state:

```ts
export const billingPaymentFailed = defineLaunchableState('billing.paymentFailed', {
  label: 'Payment failed',
  description: 'Customer has a failed payment method.',
  launch() {
    // Host application code owns the behavior.
  },
})
```

For shared command symbols, keep definitions in a dedicated module and attach handlers from feature code or a Preact hook.

Commands can also be launched programmatically without using the visual panel:

```ts
import { billingPaymentFailed } from './commands'

await billingPaymentFailed.launch()
```

Suggested API shape:

```ts
export type MountStateLauncherOptions = {
  target?: HTMLElement
  initiallyOpen?: boolean
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  title?: string
}

export type MountedStateLauncher = {
  unmount(): void
  open(): void
  close(): void
  toggle(): void
}

export type StateLauncherCommand<Id extends string = string> = {
  readonly id: Id
  readonly label?: string
  readonly description?: string
  readonly tags?: readonly string[]
  launch(): Promise<void>
}

export type LaunchableStateOptions = {
  label?: string
  description?: string
  tags?: string[]
  launch?: () => void | Promise<void>
}

export function mountStateLauncher(options?: MountStateLauncherOptions): MountedStateLauncher

export function defineLaunchableState<const Id extends string>(
  id: Id,
  options?: LaunchableStateOptions,
): StateLauncherCommand<Id>

export function launchCommand(command: StateLauncherCommand | string): Promise<void>

export function registerLaunchableState(commands: readonly StateLauncherCommand[]): void
export function unregisterCommand(command: StateLauncherCommand | string): void
export function clearCommands(): void
```

Calling `defineLaunchableState` creates a side-effect-free command handle. The handle carries its id, optional metadata, and optional launch handler. Calling `registerLaunchableState` with an array of commands makes those commands discoverable by the launcher UI. Repeated registered ids should merge into one launcher record, with the later registration updating metadata and launch behavior.

Each `StateLauncherCommand` has a `launch()` method that runs its own launch handler or the current handler attached through registration/hooks. `launchCommand` is a convenience wrapper for code that only has a command id or generic command reference. String ids resolve through the launcher registry. Missing handlers and launch errors should reject/throw and be reported in the UI when launched from the panel.

Launchable state symbols are intentionally lightweight wrappers around stable string ids. They exist to avoid typo-prone string reuse and to make command chaining explicit:

```ts
import { defineLaunchableState } from 'state-launcher'
import { inboxManyMessages } from './commands'

export const billingPaymentFailed = defineLaunchableState('billing.paymentFailed', {
  label: 'Payment failed',
  async launch() {
    await setupBillingFailure()
    await inboxManyMessages.launch()
  },
})
```

## Preact Submodule

`state-launcher/preact` should provide basic hooks for Preact applications that want command registration to follow component lifecycle.

```ts
import { useLaunchableState } from 'state-launcher/preact'
import { billingPaymentFailed } from './commands'

export function BillingDebugCommands() {
  useLaunchableState(billingPaymentFailed, () => {
    // Host application behavior.
  })

  return null
}
```

Suggested submodule API:

```ts
export function useLaunchableState(
  command: StateLauncherCommand,
  handler: () => void | Promise<void>,
): void
```

The hook should attach only the launch handler on mount/update and remove that exact handler on unmount. Attaching the handler registers the command so the launcher can discover mounted command behavior. Label, description, and tags are provided by `defineLaunchableState`, not by the hook. The hook should not mount the launcher UI automatically.

## Runtime Model

`state-launcher` keeps command registration internal. Command objects are marked with a private symbol so arbitrary objects cannot be treated as valid `StateLauncherCommand` instances just because they have an `id` property.

```ts
type CommandRecord = {
  command: StateLauncherCommand
  id: string
  label?: string
  description?: string
  tags?: string[]
  launch?: () => void | Promise<void>
}

type LauncherRegistry = {
  commandRecords: WeakMap<StateLauncherCommand, CommandRecord>
  commandsById: Map<string, StateLauncherCommand>
}
```

The public `id` is for display, filtering, and explicit string-based launching. The registry tracks command records by command handle and by id so registered duplicate ids collapse into one launcher entry.

Command groups are derived from the command id prefix before the first `.`. For example, `billing.paymentFailed` belongs to the `billing` group. Commands without a `.` can be shown in an ungrouped/default section. The MVP should not include explicit group/surface registration.

When a command is launched from the panel, through `command.launch()`, or through `launchCommand`, the package calls that command's registered `launch` function. If no launch handler is registered, launching throws/rejects. Errors should be caught and shown in the UI without breaking the launcher.

Launch handler registrations are intentionally ephemeral and are not persisted by default.

## User Experience

The MVP UI should be minimal:

```txt
[Commands]

billing
  Payment failed
  Empty invoices

inbox
  Empty inbox
  Many messages
```

Baseline behavior:

- launcher starts closed unless `initiallyOpen` is true
- open panel lists registered commands
- when the panel opens, the filter input receives focus
- filtering uses `fuzzysort2` across command id, derived group, label, description, and tags
- Arrow Up and Arrow Down change the selected command in the filtered list
- typing in the filter resets selection to the first matching command
- Enter launches the selected command
- clicking a command also runs its `launch` callback
- empty registry shows: "No commands registered."
- redefining a launchable state updates the visible list

## Isolation Strategy

The launcher should mount into a Shadow DOM boundary using `isolet-js`.

Isolation requirements:

- launcher styles do not leak into product UI
- product styles do not restyle the launcher
- launcher markup does not affect host layout except for the floating overlay
- unmount removes the host element and cleans up Preact rendering/listeners

## Accessibility

Baseline requirements:

- launcher button has an accessible label
- commands are buttons
- filter input is focused when the panel opens
- Arrow Up and Arrow Down move command selection
- Enter launches the selected command
- Escape closes the panel
- keyboard users can open, close, filter, select, and launch commands
- focus returns to the launcher button when the panel closes

## Recommended Package Structure

```txt
src/
  index.ts
  mountStateLauncher.tsx
  registry.ts
  types.ts
  preact.ts
  ui/
    StateLauncher.tsx
    StateList.tsx
    StateItem.tsx
    StateLauncher.module.css
```

## Acceptance Criteria

- `mountStateLauncher` mounts an isolated launcher into `document.body` by default.
- `defineLaunchableState` creates typed launchable state symbols for stable command ids.
- `defineLaunchableState` can attach or replace a launch handler for one launchable state.
- `StateLauncherCommand` objects are internally tagged with a WeakMap.
- Each `StateLauncherCommand` includes a `launch()` method.
- Launching a command with no registered handler throws/rejects.
- Command groups are derived from each command id's `<group>.*` prefix; no explicit surface/group registration is required.
- `command.launch()` launches a registered command programmatically.
- `launchCommand` remains available as a convenience wrapper for generic command references or string ids.
- `state-launcher/preact` exports a basic `useLaunchableState` hook.
- The panel displays registered commands grouped by the command id prefix before the first `.`.
- The filter input is focused when the panel opens.
- Filtering uses `fuzzysort2`.
- Arrow keys change the selected command.
- Typing in the filter resets command selection.
- Enter calls the selected command's `launch` function.
- Clicking a command calls its `launch` function.
- Launch errors are caught and displayed or logged.
- `unmount` removes the launcher cleanly.
- The bundled UI uses `isolet-js`, `preact`, `@preact/signals`, CSS modules, `fuzzysort2`, and Vite.
