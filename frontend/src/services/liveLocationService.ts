import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { emitLiveLocationUpdate, emitLiveLocationStop } from './socket';

const ACTIVE_SESSIONS_KEY = '@nearme:active_live_locations';

export interface LiveLocationSession {
  messageId: string;
  conversationId?: string;
  roomId?: string;
  expiresAt: string; // ISO string
  label?: string;
  lastLat?: number;
  lastLng?: number;
  lastUpdatedAt?: string;
}

type SessionState = LiveLocationSession & {
  subscription?: Location.LocationSubscription;
  timer?: ReturnType<typeof setTimeout>;
};

const activeSessions: Map<string, SessionState> = new Map();
const listeners: Set<() => void> = new Set();

function notifyListeners(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

export function subscribeToLiveLocationChanges(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function persistSessions(): Promise<void> {
  const plain: LiveLocationSession[] = Array.from(activeSessions.values()).map((s) => ({
    messageId: s.messageId,
    conversationId: s.conversationId,
    roomId: s.roomId,
    expiresAt: s.expiresAt,
    label: s.label,
    lastLat: s.lastLat,
    lastLng: s.lastLng,
    lastUpdatedAt: s.lastUpdatedAt,
  }));
  await AsyncStorage.setItem(ACTIVE_SESSIONS_KEY, JSON.stringify(plain)).catch(() => {});
}

/**
 * Start streaming live location for a specific message/conversation.
 */
export async function startLiveLocationStreaming(session: {
  messageId: string;
  conversationId?: string;
  roomId?: string;
  durationMinutes: number;
  label?: string;
}): Promise<boolean> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) return false;

  // Clean up any existing session for this message
  stopLiveLocationStreaming(session.messageId);

  const expiresAt = new Date(Date.now() + session.durationMinutes * 60 * 1000).toISOString();
  const sessionData: SessionState = {
    messageId: session.messageId,
    conversationId: session.conversationId,
    roomId: session.roomId,
    expiresAt,
    label: session.label,
  };

  // Watch position with balanced battery efficiency
  try {
    const subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 10_000, // every 10 seconds
        distanceInterval: 10, // or every 10 meters
      },
      (pos) => {
        const { latitude, longitude } = pos.coords;
        sessionData.lastLat = latitude;
        sessionData.lastLng = longitude;
        sessionData.lastUpdatedAt = new Date().toISOString();

        emitLiveLocationUpdate({
          conversationId: session.conversationId,
          roomId: session.roomId,
          messageId: session.messageId,
          lat: latitude,
          lng: longitude,
        });
        notifyListeners();
      }
    );

    sessionData.subscription = subscription;

    // Auto-expire timer
    const remainingMs = Math.max(0, new Date(expiresAt).getTime() - Date.now());
    sessionData.timer = setTimeout(() => {
      stopLiveLocationStreaming(session.messageId);
    }, remainingMs);

    activeSessions.set(session.messageId, sessionData);
    await persistSessions();
    notifyListeners();
    return true;
  } catch (err) {
    console.error('[LiveLocation] Failed to start watcher', err);
    return false;
  }
}

/**
 * Stop streaming live location for a message.
 */
export function stopLiveLocationStreaming(messageId: string): void {
  const session = activeSessions.get(messageId);
  if (!session) return;

  if (session.subscription) {
    session.subscription.remove();
  }
  if (session.timer) {
    clearTimeout(session.timer);
  }

  emitLiveLocationStop({
    conversationId: session.conversationId,
    roomId: session.roomId,
    messageId,
  });

  activeSessions.delete(messageId);
  persistSessions().catch(() => {});
  notifyListeners();
}

/**
 * Check if a live location stream is currently running on this device.
 */
export function isStreamingLiveLocation(messageId: string): boolean {
  const session = activeSessions.get(messageId);
  if (!session) return false;
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    stopLiveLocationStreaming(messageId);
    return false;
  }
  return true;
}

/**
 * Get the active session details if streaming.
 */
export function getLiveSession(messageId: string): LiveLocationSession | null {
  const s = activeSessions.get(messageId);
  if (!s) return null;
  return {
    messageId: s.messageId,
    conversationId: s.conversationId,
    roomId: s.roomId,
    expiresAt: s.expiresAt,
    label: s.label,
    lastLat: s.lastLat,
    lastLng: s.lastLng,
    lastUpdatedAt: s.lastUpdatedAt,
  };
}
