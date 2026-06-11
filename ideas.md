# state-launcher Ideas

Ideas in this file are intentionally out of MVP scope. Move them into `concept.md` only when they become necessary.

## Event Protocol

Expose DOM `CustomEvent` protocols for hosts that prefer decoupled registration/activation over direct function imports.

Possible events:

- `state-launcher:register`
- `state-launcher:launch`
- `state-launcher:done`
- `state-launcher:reset`

## Launch Completion Status

Track pending/success/error status for async launches and display recent results in the UI.

## History

Show recently launched states, including payloads and status.

## Search and Filtering

Search across state id, label, description, surface title, and tags.

## Parameters

Allow states to declare simple parameters before launch.

Possible MVP-compatible parameter types if needed later:

- string
- number
- boolean
- enum

Avoid becoming a general form renderer.

## Reset Button

Expose a reset action that delegates entirely to host application code.

Possible host behavior:

- clear mock scenarios
- reset local debug signals
- reload current route
- deactivate active debug states

## Copy State IDs

Add controls for copying stable state IDs for docs, tests, or bug reports.

## Test Helpers

Export small helpers for automated tests to launch states without mounting the visual panel.

## Persistence

Persist open/closed state, history, or last search query in local storage.

## Advanced Layout

- draggable panel
- resizable panel
- multiple positions
- compact mode
- keyboard command palette

## Integrations

Keep framework-specific or product-specific integrations outside the core package unless demand is strong.

Possible integrations:

- React helper
- Vue helper
- app event-hub bridge
- mock server bridge
- Storybook addon

## Out-of-Scope Product Features

These should not belong in the core package:

- product state orchestration
- scenario engine
- mock API management
- event bus explorer
- network inspection
- visual screenshot capture
- remote state sharing
- production behavior
