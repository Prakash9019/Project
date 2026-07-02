import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_SEEN_KEY = 'interest_last_seen';

export async function markInterestSeen(): Promise<void> {
  await AsyncStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
}

export async function getLastSeenTimestamp(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_SEEN_KEY);
}

export async function hasUnreadInterest(
  views: { viewedAt: string }[],
  taps: { createdAt: string }[]
): Promise<boolean> {
  const lastSeen = await getLastSeenTimestamp();
  if (!lastSeen) return views.length > 0 || taps.length > 0;
  const lastSeenDate = new Date(lastSeen);
  const hasNewView = views.some((v) => new Date(v.viewedAt) > lastSeenDate);
  const hasNewTap = taps.some((t) => new Date(t.createdAt) > lastSeenDate);
  return hasNewView || hasNewTap;
}
