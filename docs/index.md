# State Launcher

> Choose the browser panel or headless controller, then keep state ownership in the application that knows how to build each state.

State Launcher is a development and testing command launcher. It gives named
application states a stable identity, searchable metadata, and a lifecycle for
launch handlers without turning those states into production navigation.

## Choose a surface

| Surface             | Start here when                                    | Owns the presentation                                                                                     |
| ------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Browser launcher    | A developer or QA user needs an in-page panel.     | State Launcher mounts a searchable Shadow DOM-isolated panel.                                             |
| Headless controller | Another host already provides the command browser. | The host renders snapshots and sends stable ids; the retained WebView keeps the registry and transitions. |

Both surfaces share one registry. Registration, handler availability, abort
signals, cleanup, and active-state changes do not have separate browser and
headless implementations.

## Start with a task

- [Getting started](getting-started.md): register your first command and choose a surface.
- [Browser launcher](guides/browser-launcher.md): configure the panel, search, routes, auth, and Clear.
- [Headless controller](guides/headless-controller.md): consume serializable snapshots and launch by id without mounting UI.
- [Framework hooks](guides/framework-hooks.md): attach handlers to React or Preact component lifetimes.
- [Lifecycle and ownership](concepts/lifecycle.md): understand command identity, transitions, cleanup, aborts, and HMR.

## API reference

The API pages are generated from the package's exported declarations during the
lildocs build, so signatures stay aligned with the published entry points:

- [Root API](reference/state-launcher.md)
- [Headless API](reference/state-launcher/headless.md)
- [React API](reference/state-launcher/react.md)
- [Preact API](reference/state-launcher/preact.md)

## Boundaries

State Launcher is for development and testing. It is not a production router,
feature-flag system, analytics surface, mock-server coordinator, data seeder,
or representation of end-user state. The host application owns what a handler
does and how it restores the application when the state is cleared.
