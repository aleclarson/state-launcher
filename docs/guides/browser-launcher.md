# Browser Launcher

> Mount the in-page panel when developers or QA users need to search, launch, inspect, and clear registered application states.

## Mount the panel

```ts
import { mountStateLauncher } from 'state-launcher'

const launcher = mountStateLauncher({
  target: document.body,
  initiallyOpen: false,
  position: 'bottom-right',
  title: 'App states',
})

document.querySelector('#open-state-launcher')?.addEventListener('click', () => {
  launcher.toggle()
})
```

The panel is isolated in a Shadow DOM and does not render a persistent trigger.
Wire the returned controller to an app-owned button, menu item, keyboard
shortcut, or test helper. Only one panel can be mounted at a time.

The controller supports `open()`, `close()`, `toggle()`, `refresh()`, and
`unmount()`. Unmounting removes the panel but leaves registered commands and the
active state unchanged.

## Configure the panel

| Option          | Default          | Use it for                                                      |
| --------------- | ---------------- | --------------------------------------------------------------- |
| `target`        | `document.body`  | Choose the element that receives the isolated host.             |
| `initiallyOpen` | `false`          | Open the panel immediately after mounting.                      |
| `position`      | `'bottom-right'` | Choose a desktop corner; smaller viewports use a bottom drawer. |
| `title`         | `'Commands'`     | Set the accessible dialog label.                                |
| `showPathname`  | `false`          | Add home and editable-pathname controls.                        |

At viewport widths of `1024px` and below, the panel becomes a fullscreen bottom
drawer. The drawer has a safe-area-aware dismissal strip and supports a downward
swipe from its drag area.

## Search and route relevance

The panel searches command ids, labels, descriptions, and tags. With an empty
search, it groups commands by the first dotted id segment and can show route-
relevant or recently launched commands first. During search, results become one
flat ranked list.

Declare pathname patterns on a command when a state is especially useful on a
route:

```ts
defineLaunchableState('billing.paymentFailed', {
  label: 'Payment failed',
  routes: ['/billing', '/billing/invoices/*'],
})
```

Exact patterns match one normalized pathname. A terminal `/*` matches that path
and its descendants. Query strings and hashes are ignored. Call the mounted
controller's `refresh()` after an SPA navigation that uses
`history.pushState()` or `history.replaceState()`; browser back and forward are
handled automatically.

## Authentication actions

Pass paired callbacks when the panel should expose a sign-in/sign-out toggle or
when handlers need `signIn()` and `signOut()` in their launch context:

```ts
mountStateLauncher({
  auth: {
    isSignedIn: Boolean(currentUser),
    onSignIn: () => signInAsTestUser(),
    onSignOut: () => signOutTestUser(),
    homePath: ({ isSignedIn }) => (isSignedIn ? '/dashboard' : '/'),
  },
  showPathname: true,
})
```

Actions are serialized and idempotent for the current auth state. A successful
action updates the toggle and `homePath`; a rejected action leaves the current
action available and displays the error.

## Launch, errors, and Clear

Commands without handlers are shown as disabled. A panel launch closes the panel
after setup succeeds and records the launch for the Recent group. Handler errors
are shown in the panel and do not mark the command active.

The Clear action aborts the active launch signal and awaits known cleanup:

```ts
import { clearActiveState } from 'state-launcher'

await clearActiveState()
```

Clearing does not unregister commands. The active marker remains visible until
cleanup finishes, then disappears.

For async setup and cleanup ordering, see
[lifecycle and ownership](../concepts/lifecycle.md). For a host-owned browser,
use the [headless controller](headless-controller.md) instead of mounting this
panel.
