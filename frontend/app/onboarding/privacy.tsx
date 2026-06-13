import { useRouter } from 'expo-router';
import { LegalScreen } from '../../src/components/LegalScreen';

const SECTIONS = [
  { heading: 'Privacy Policy', body: 'This Privacy Policy explains how NearMe collects, uses, and shares information about you when you use our services. We are committed to protecting your privacy.' },
  { heading: 'Information We Collect', body: 'We collect information you provide such as your profile details, photos, and messages, as well as information collected automatically such as device information, approximate location, and usage data.' },
  { heading: 'How We Use Information', body: 'We use your information to operate and improve the service, to show you nearby profiles, to personalise your experience, to keep the community safe, and to provide customer support.' },
  { heading: 'Location Information', body: 'NearMe is a location-based service. With your permission we use your approximate location to show you and other users distance information. You can control location sharing in your device settings.' },
  { heading: 'Sensitive Information', body: 'Some information you choose to share — such as health-related fields — may be considered sensitive. We process this information only with your consent and you may remove it at any time.' },
  { heading: 'Sharing', body: 'We do not sell your personal data. We may share information with service providers who help us operate the platform, and where required by law.' },
  { heading: 'Your Choices', body: 'You can access, update, or delete your profile information at any time. You can also request deletion of your account through the app settings.' },
  { heading: 'Consent', body: 'By tapping "I Agree" you consent to the collection and use of your information as described in this Privacy Policy.' },
];

export default function Privacy() {
  const router = useRouter();
  return (
    <LegalScreen
      title="Privacy Policy"
      sections={SECTIONS}
      cta="I Agree"
      onAgree={() => router.push('/onboarding/intro')}
    />
  );
}
