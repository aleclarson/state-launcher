# state-launcher Concept

## Summary

`state-launcher` is a small dev/test-only package for registering and launching named application states from an isolated in-page UI.

It provides:

- a Shadow DOM-isolated launcher UI
- a programmatic API for application code to define, register, and fire commands
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
- programmatic command firing
- granular programmatic command registration
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
import { mountStateLauncher } from "state-launcher";

const launcher = mountStateLauncher({
  target: document.body,
  initiallyOpen: false,
  position: "bottom-right",
});

launcher.unmount();
```

Application code defines launchable state symbols in a dedicated module so they can be imported by registration code, tests, and other commands that need command chaining. The prefix before the first `.` is used as the UI group:

```ts
// src/debug/commands.ts
import { defineLaunchableState } from "state-launcher";

export const billingPaymentFailed = defineLaunchableState("billing.paymentFailed");
export const inboxManyMessages = defineLaunchableState("inbox.manyMessages");
```

Application code registers commands one at a time:

```ts
import { registerCommand } from "state-launcher";
import { billingPaymentFailed } from "./commands";

const unregister = registerCommand({
  command: billingPaymentFailed,
  label: "Payment failed",
  description: "Customer has a failed payment method.",
  launch() {
    // Host application code owns the behavior.
  },
});

unregister();
```

Commands can also be fired programmatically without using the visual panel:

```ts
import { fireCommand } from "state-launcher";
import { billingPaymentFailed } from "./commands";

await fireCommand(billingPaymentFailed);
```

Suggested API shape:

```ts
export type MountStateLauncherOptions = {
  target?: HTMLElement;
  initiallyOpen?: boolean;
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  title?: string;
};

export type MountedStateLauncher = {
  unmount(): void;
  open(): void;
  close(): void;
  toggle(): void;
};

export type StateLauncherCommand<Id extends string = string> = {
  id: Id;
};

export type StateLauncherRegisteredCommand<Id extends string = string> = {
  command: StateLauncherCommand<Id>;
  label: string;
  description?: string;
  tags?: string[];
  launch(): void | Promise<void>;
};

export type UnregisterStateLauncherCommand = () => void;

export function mountStateLauncher(
  options?: MountStateLauncherOptions,
): MountedStateLauncher;

export function defineLaunchableState<const Id extends string>(
  id: Id,
): StateLauncherCommand<Id>;

export function fireCommand(command: StateLauncherCommand | string): Promise<void>;

export function registerCommand(
  command: StateLauncherRegisteredCommand,
): UnregisterStateLauncherCommand;

export function unregisterCommand(command: StateLauncherCommand | string): void;
export function clearCommands(): void;
```

Registering a command with an existing command id should replace the previous registration for that id. `registerCommand` returns an unregister function for lifecycle cleanup.

`fireCommand` should find the registered command for the given command symbol or id and run its `launch` callback. Missing commands and launch errors should reject the returned promise and be reported in the UI when fired from the panel.

Launchable state symbols are intentionally lightweight wrappers around stable string ids. They exist to avoid typo-prone string reuse and to make command chaining explicit:

```ts
import { fireCommand, registerCommand } from "state-launcher";
import { billingPaymentFailed, inboxManyMessages } from "./commands";

registerCommand({
  command: billingPaymentFailed,
  label: "Payment failed",
  async launch() {
    await setupBillingFailure();
    await fireCommand(inboxManyMessages);
  },
});
```

## Preact Submodule

`state-launcher/preact` should provide basic hooks for Preact applications that want command registration to follow component lifecycle.

```ts
import { useLaunchableState } from "state-launcher/preact";
import { billingPaymentFailed } from "./commands";

export function BillingDebugCommands() {
  useLaunchableState({
    command: billingPaymentFailed,
    label: "Payment failed",
    launch() {
      // Host application behavior.
    },
  });

  return null;
}
```

Suggested submodule API:

```ts
export function useLaunchableState(
  command: StateLauncherRegisteredCommand,
): void;
```

The hook should register on mount/update and unregister the same command on unmount. It should not mount the launcher UI automatically.

## Runtime Model

`state-launcher` keeps a simple in-memory registry of commands.

```ts
type LauncherRegistry = {
  commands: Map<string, StateLauncherRegisteredCommand>;
};
```

Command groups are derived from the command id prefix before the first `.`. For example, `billing.paymentFailed` belongs to the `billing` group. Commands without a `.` can be shown in an ungrouped/default section. The MVP should not include explicit group/surface registration.

When a command is launched from the panel or through `fireCommand`, the package calls that command's `launch` function. Errors should be caught and shown in the UI without breaking the launcher.

Command registrations are intentionally ephemeral and are not persisted by default.

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
- Enter fires the selected command
- clicking a command also runs its `launch` callback
- empty registry shows: "No commands registered."
- command re-registration updates the visible list

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
- `registerCommand` registers one launchable command.
- Registering an existing command id replaces that command.
- Command groups are derived from each command id's `<group>.*` prefix; no explicit surface/group registration is required.
- `fireCommand` launches a registered command programmatically.
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
