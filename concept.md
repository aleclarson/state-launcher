# state-launcher Concept

## Summary

`state-launcher` is a small dev/test-only package for registering and launching named application states from an isolated in-page UI.

It provides:

- a Shadow DOM-isolated launcher UI
- a programmatic API for application code to register states
- a simple activation protocol for launching a registered state

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

## MVP Scope

The first version should include only the bare necessities:

- Shadow DOM isolated mount
- floating launcher button
- open/close panel
- programmatic state registration
- registered state list grouped by surface
- state activation
- unmount API
- exported constants and TypeScript types

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

Application code registers states programmatically:

```ts
import { registerStates } from "state-launcher";

registerStates({
  surface: "billing",
  title: "Billing",
  states: [
    {
      id: "billing.paymentFailed",
      label: "Payment failed",
      description: "Customer has a failed payment method.",
      launch() {
        // Host application code owns the behavior.
      },
    },
  ],
});
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

export type StateLauncherState = {
  id: string;
  label: string;
  description?: string;
  tags?: string[];
  launch(): void | Promise<void>;
};

export type StateLauncherSurface = {
  surface: string;
  title?: string;
  states: StateLauncherState[];
};

export function mountStateLauncher(
  options?: MountStateLauncherOptions,
): MountedStateLauncher;

export function registerStates(surface: StateLauncherSurface): void;
export function unregisterStates(surface: string): void;
export function clearStates(): void;
```

Repeated registration for the same surface should replace that surface's state list.

## Runtime Model

`state-launcher` keeps a simple in-memory registry of surfaces and states.

```ts
type LauncherRegistry = {
  surfaces: Map<string, StateLauncherSurface>;
};
```

When a state is launched, the package calls that state's `launch` function. Errors should be caught and shown in the UI without breaking the launcher.

State registrations are intentionally ephemeral and are not persisted by default.

## User Experience

The MVP UI should be minimal:

```txt
[States]

Billing
  Payment failed
  Empty invoices

Inbox
  Empty inbox
  Many messages
```

Baseline behavior:

- launcher starts closed unless `initiallyOpen` is true
- open panel lists registered states
- selecting a state runs its `launch` callback
- empty registry shows: "No states registered."
- surface re-registration updates the visible list

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
- states are buttons
- Escape closes the panel
- keyboard users can open, close, and launch states
- focus returns to the launcher button when the panel closes

## Recommended Package Structure

```txt
src/
  index.ts
  mountStateLauncher.tsx
  registry.ts
  types.ts
  ui/
    StateLauncher.tsx
    StateList.tsx
    StateItem.tsx
    StateLauncher.module.css
```

## Acceptance Criteria

- `mountStateLauncher` mounts an isolated launcher into `document.body` by default.
- `registerStates` registers a surface of launchable states.
- Re-registering a surface replaces its states.
- The panel displays registered states.
- Clicking a state calls its `launch` function.
- Launch errors are caught and displayed or logged.
- `unmount` removes the launcher cleanly.
- The bundled UI uses `isolet-js`, `preact`, `@preact/signals`, CSS modules, and Vite.
