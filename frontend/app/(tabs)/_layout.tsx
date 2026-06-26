import { Tabs } from 'expo-router';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, FontFamily, DisplayFont } from '../../src/theme';
import { RightNowIcon } from '../../src/components/icons';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type TabDef =
  | { name: string; label: string; active: IoniconName; inactive: IoniconName; svgIcon?: undefined }
  | { name: string; label: string; svgIcon: true; active?: undefined; inactive?: undefined };

const TABS: TabDef[] = [
  { name: 'index',     label: 'Browse',    active: 'grid',                inactive: 'grid-outline' },
  { name: 'right-now', label: 'Right Now', svgIcon: true },
  { name: 'interest',  label: 'Interest',  active: 'heart',               inactive: 'heart-outline' },
  { name: 'inbox',     label: 'Inbox',     active: 'chatbubble-ellipses', inactive: 'chatbubble-ellipses-outline' },
  { name: 'store',     label: 'Store',     active: 'diamond',             inactive: 'diamond-outline' },
];

function TabIcon({ name, color, active }: { name: string; color: string; active: boolean }) {
  const meta = TABS.find((t) => t.name === name);
  if (!meta) return null;
  if (meta.svgIcon) {
    return <RightNowIcon size={25} color={color} solid={active} />;
  }
  return <Ionicons name={active ? meta.active : meta.inactive} size={25} color={color} />;
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
                <TabIcon name={route.name} color={color} active={active} />
              </View>
              <Text
                style={[
                  s.label,
                  { color, fontFamily: active ? DisplayFont.bold : FontFamily.semibold },
                ]}
              >
                {meta.label}
              </Text>
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
  label: { fontSize: 11 },
});
