import { useEffect } from 'react';
import { useRouter } from 'expo-router';

// Phone OTP auth replaced by Firebase email/Google auth.
export default function PhoneRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/onboarding/auth');
  }, [router]);
  return null;
}
