import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { updateProfile } from './api';

export type DisguiseIcon = 'default' | 'calculator' | 'notes' | 'weather' | 'calendar' | 'news';

export interface DiscreetConfig {
  enabled: boolean;
  selectedIcon: DisguiseIcon;
  hideNotificationPreviews: boolean;
  decoyCalculatorEnabled: boolean;
  isCamouflaged: boolean;
}

const STORAGE_KEY = 'nearme_discreet_config_v1';

const DEFAULT_CONFIG: DiscreetConfig = {
  enabled: false,
  selectedIcon: 'default',
  hideNotificationPreviews: true,
  decoyCalculatorEnabled: true,
  isCamouflaged: false,
};

let currentConfig: DiscreetConfig = { ...DEFAULT_CONFIG };
const listeners = new Set<(cfg: DiscreetConfig) => void>();

function notify() {
  listeners.forEach((fn) => fn({ ...currentConfig }));
}

/** Check if running inside Expo Go */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/**
 * Initializes and loads discreet configuration from local secure store.
 */
export async function initDiscreetService(): Promise<DiscreetConfig> {
  try {
    let raw = await SecureStore.getItemAsync(STORAGE_KEY).catch(() => null);
    if (!raw) {
      raw = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
    }
    if (raw) {
      currentConfig = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch {}
  notify();
  return currentConfig;
}

export function getDiscreetConfig(): DiscreetConfig {
  return { ...currentConfig };
}

export function subscribeDiscreet(fn: (cfg: DiscreetConfig) => void): () => void {
  listeners.add(fn);
  fn({ ...currentConfig });
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Saves discreet configuration locally and syncs `disceetMode` with backend user profile.
 */
export async function updateDiscreetConfig(partial: Partial<DiscreetConfig>): Promise<DiscreetConfig> {
  currentConfig = { ...currentConfig, ...partial };
  notify();

  const serialized = JSON.stringify(currentConfig);
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, serialized, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    await AsyncStorage.setItem(STORAGE_KEY, serialized).catch(() => {});
  }

  // Sync to backend profile
  if (partial.enabled !== undefined) {
    updateProfile({ disceetMode: partial.enabled }).catch(() => {});
  }

  return currentConfig;
}

/**
 * Attempts to switch native app icon if supported in standalone/production build.
 */
export async function setAppIcon(icon: DisguiseIcon): Promise<{ success: boolean; isPreviewOnly: boolean }> {
  await updateDiscreetConfig({ selectedIcon: icon });

  if (isExpoGo()) {
    // Dynamic app icon requires native code unavailable in standard Expo Go testing
    return { success: true, isPreviewOnly: true };
  }

  try {
    // If native dynamic app icon module is linked in standalone dev/production build
    const dynamicIconModule = (globalThis as unknown as { ExpoDynamicAppIcon?: { setAppIcon: (name: string) => Promise<boolean> } }).ExpoDynamicAppIcon;
    if (dynamicIconModule && typeof dynamicIconModule.setAppIcon === 'function') {
      const iconName = icon === 'default' ? null : `icon_${icon}`;
      await dynamicIconModule.setAppIcon(iconName || 'DEFAULT');
      return { success: true, isPreviewOnly: false };
    }
  } catch {}

  return { success: true, isPreviewOnly: true };
}

/**
 * Activates or deactivates the Camouflage Decoy screen.
 */
export function setCamouflageMode(active: boolean) {
  updateDiscreetConfig({ isCamouflaged: active });
}

/**
 * Masks notification title and body if Discreet Mode is enabled.
 */
export function sanitizeNotificationContent(
  title: string | null | undefined,
  body: string | null | undefined,
): { title: string; body: string } {
  if (currentConfig.enabled && currentConfig.hideNotificationPreviews) {
    return {
      title: 'New Notification',
      body: 'You have a new message',
    };
  }
  return {
    title: title || 'Notification',
    body: body || '',
  };
}

// Kick off initial load
initDiscreetService().catch(() => {});
