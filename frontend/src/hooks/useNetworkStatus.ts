import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/** Reactive online/offline status from NetInfo. Assumes online until told otherwise. */
export function useNetworkStatus(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
    return () => unsub();
  }, []);
  return online;
}
