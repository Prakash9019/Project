import { useEffect } from 'react';
import { useRouter } from 'expo-router';

// OTP auth replaced by Firebase email/Google auth.
export default function OtpRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/onboarding/auth');
  }, [router]);
  return null;
}
