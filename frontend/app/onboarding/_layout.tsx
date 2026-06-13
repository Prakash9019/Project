import { Stack } from 'expo-router';
import { useTheme } from '../../src/theme';

export default function OnboardingLayout() {
  const { theme } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
      }}
    />
  );
}
