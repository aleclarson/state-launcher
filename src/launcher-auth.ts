export type LauncherAuthActions = {
  signIn(): Promise<void>
  signOut(): Promise<void>
}

let launcherAuthActions: LauncherAuthActions | undefined

export function registerLauncherAuthActions(actions: LauncherAuthActions): () => void {
  if (launcherAuthActions) {
    throw new Error('State launcher authentication is already registered.')
  }

  launcherAuthActions = actions

  return () => {
    if (launcherAuthActions === actions) {
      launcherAuthActions = undefined
    }
  }
}

export async function signIn(): Promise<void> {
  if (!launcherAuthActions) {
    throw new Error('State launcher authentication is not configured.')
  }

  await launcherAuthActions.signIn()
}

export async function signOut(): Promise<void> {
  if (!launcherAuthActions) {
    throw new Error('State launcher authentication is not configured.')
  }

  await launcherAuthActions.signOut()
}
