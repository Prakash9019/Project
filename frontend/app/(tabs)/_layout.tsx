import { Tabs } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme';
import { NearMeLogo } from '../../src/components/icons';

const TABS = [
  { name: 'index', label: 'Browse' },
  { name: 'right-now', label: 'Right Now' },
  { name: 'interest', label: 'Interest' },
  { name: 'inbox', label: 'Inbox' },
  { name: 'store', label: 'Store' },
] as const;

function TabIcon({ name, color }: { name: string; color: string }) {
  switch (name) {
    case 'index':
      return <NearMeLogo size={26} color={color} />;
    case 'right-now':
      return <Ionicons name="flash" size={24} color={color} />;
    case 'interest':
      return <Ionicons name="heart" size={24} color={color} />;
    case 'inbox':
      return <Ionicons name="chatbubble" size={23} color={color} />;
    case 'store':
      return <Ionicons name="diamond" size={22} color={color} />;
    default:
      return null;
  }
}

function CustomTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  return (
    <View style={[s.bar, { backgroundColor: theme.tabBar, borderTopColor: theme.border, paddingBottom: insets.bottom || 8 }]}>
      {state.routes
        .filter((r: any) => TABS.some((t) => t.name === r.name))
        .map((route: any) => {
          const meta = TABS.find((t) => t.name === route.name)!;
          const routeIndex = state.routes.findIndex((r: any) => r.key === route.key);
          const active = state.index === routeIndex;
          const color = active ? theme.tabBarActive : theme.tabBarInactive;
          return (
            <Pressable
              key={route.key}
              style={s.tab}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!active && !event.defaultPrevented) navigation.navigate(route.name);
              }}
            >
              <View style={s.iconWrap}>
                <TabIcon name={route.name} color={color} />
              </View>
              <Text style={[s.label, { color }]}>{meta.label}</Text>
            </Pressable>
          );
        })}
    </View>
  );
}

export default function TabsLayout() {
  const { theme } = useTheme();
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.background } }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="right-now" />
      <Tabs.Screen name="interest" />
      <Tabs.Screen name="inbox" />
      <Tabs.Screen name="store" />
    </Tabs>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  iconWrap: { height: 28, justifyContent: 'center' },
  label: { fontSize: 11, fontWeight: '600' },
});
