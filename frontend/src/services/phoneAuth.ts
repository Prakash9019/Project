/**
 * Firebase Phone Auth helper. The `confirmation` object returned by
 * signInWithPhoneNumber cannot be serialized through router params, so it is
 * held here in module scope and consumed by the code-entry screen.
 *
 * Lazy-requires @react-native-firebase so the web bundle never tries to load
 * the native module (matches the pattern in onboarding/auth.tsx).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Confirmation = any;

let pendingConfirmation: Confirmation | null = null;
let pendingPhone: string | null = null;

function getFirebaseAuth() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-firebase/app');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { default: auth } = require('@react-native-firebase/auth');
  return auth();
}

/** Send an SMS OTP to the given E.164 number and stash the confirmation. */
export async function sendPhoneOtp(phoneE164: string): Promise<void> {
  const auth = getFirebaseAuth();
  pendingConfirmation = await auth.signInWithPhoneNumber(phoneE164);
  pendingPhone = phoneE164;
}

/** The phone number a code was last sent to (for display on the code screen). */
export function getPendingPhone(): string | null {
  return pendingPhone;
}

export function hasPendingConfirmation(): boolean {
  return pendingConfirmation !== null;
}

/** Confirm the entered code → returns a Firebase ID token to exchange for a NearMe JWT. */
export async function confirmPhoneOtp(code: string): Promise<string> {
  if (!pendingConfirmation) throw new Error('No pending phone verification. Request a new code.');
  const credential = await pendingConfirmation.confirm(code);
  return credential.user.getIdToken();
}

export function clearPhoneAuth(): void {
  pendingConfirmation = null;
  pendingPhone = null;
}
