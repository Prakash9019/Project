/**
 * Lightweight tracker for the *currently focused* route + its params, used to
 * decide whether an incoming notification should be shown as a toast. Under
 * expo-router the NavigationContainer is owned by the router, so instead of
 * creating our own container ref we let the root layout hand us the router's
 * ref (via `useNavigationContainerRef()`) through `setNavigationRef`.
 *
 * Route names match expo-router's file segments, e.g. `chat/[id]`,
 * `rooms/[id]`, `call/[id]`, and params carry the dynamic segment (`{ id }`).
 */

type CurrentRoute = { name?: string; params?: Record<string, unknown> } | undefined;

interface NavRefLike {
  getCurrentRoute?: () => CurrentRoute;
}

let navRef: NavRefLike | null = null;

/** Called once from the root layout with the router's navigation container ref. */
export function setNavigationRef(ref: NavRefLike | null): void {
  navRef = ref;
}

/** The focused route's name (e.g. `chat/[id]`), or undefined before mount. */
export function getCurrentRoute(): string | undefined {
  return navRef?.getCurrentRoute?.()?.name;
}

/** The focused route's params (e.g. `{ id }`), or undefined. */
export function getCurrentParams(): Record<string, unknown> | undefined {
  return navRef?.getCurrentRoute?.()?.params;
}

/**
 * True when the user is already viewing the content a notification is about,
 * so we should NOT toast it. Pass the route segment and the id it must match.
 * Example: `isViewing('chat/[id]', conversationId)`.
 */
export function isViewing(routeName: string, id?: string): boolean {
  if (getCurrentRoute() !== routeName) return false;
  if (id == null) return true;
  return getCurrentParams()?.id === id;
}
