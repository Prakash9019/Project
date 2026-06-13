import { useRouter } from 'expo-router';
import { LegalScreen } from '../../src/components/LegalScreen';

const SECTIONS = [
  { heading: 'Terms of Service', body: 'Welcome to NearMe. These Terms of Service ("Terms") govern your access to and use of the NearMe application, websites, and services. By creating an account or using the app you agree to these Terms.' },
  { heading: '1. Eligibility', body: 'You must be at least 18 years old to create an account and use NearMe. By using the service you represent and warrant that you are 18 or older and that you have the right and capacity to enter into these Terms.' },
  { heading: '2. Your Account', body: 'You are responsible for safeguarding your account credentials and for any activity that occurs under your account. You agree to provide accurate information and to keep it up to date.' },
  { heading: '3. Acceptable Use', body: 'You agree not to use the service for any unlawful purpose, to harass other users, to impersonate any person, or to post content that is illegal, abusive, or that violates the rights of others. We may remove content and suspend accounts that violate these Terms.' },
  { heading: '4. Content', body: 'You retain ownership of content you post but grant NearMe a worldwide, non-exclusive license to host, store, and display that content for the purpose of operating the service. You are solely responsible for the content you share.' },
  { heading: '5. Subscriptions & Purchases', body: 'NearMe offers optional paid features (Premium, Gold, Platinum, and add-ons). Subscriptions auto-renew under identical terms unless cancelled at least 24 hours before renewal through your app store account settings.' },
  { heading: '6. Safety', body: 'Your safety matters. Never send money to people you have not met, be cautious sharing personal information, and meet in public when meeting someone for the first time. Report any behaviour that violates these Terms.' },
  { heading: '7. Disclaimers', body: 'The service is provided "as is" without warranties of any kind. NearMe does not conduct criminal background checks on its users and is not responsible for the conduct of any user.' },
  { heading: '8. Limitation of Liability', body: 'To the maximum extent permitted by law, NearMe shall not be liable for any indirect, incidental, or consequential damages arising out of your use of the service.' },
  { heading: '9. Changes to These Terms', body: 'We may update these Terms from time to time. Continued use of the service after changes become effective constitutes acceptance of the revised Terms.' },
  { heading: '10. Contact', body: 'Questions about these Terms can be directed to support through the in-app Help Center. By tapping "I Agree" you acknowledge that you have read and accepted these Terms of Service.' },
];

export default function Terms() {
  const router = useRouter();
  return (
    <LegalScreen
      title="Terms of Service"
      sections={SECTIONS}
      cta="I Agree"
      onAgree={() => router.push('/onboarding/privacy')}
    />
  );
}
