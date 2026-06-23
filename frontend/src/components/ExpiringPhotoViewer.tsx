import { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';

interface Props {
  visible: boolean;
  url: string | null;
  expiresInSeconds: number;
  loading?: boolean;
  onClose: () => void;
}

export function ExpiringPhotoViewer({ visible, url, expiresInSeconds, loading, onClose }: Props) {
  const { theme } = useTheme();
  const [remaining, setRemaining] = useState(expiresInSeconds);

  useEffect(() => {
    if (!visible || !url) return;
    setRemaining(expiresInSeconds);
    const t = setInterval(() => {
      setRemaining((r) => (r <= 1 ? 0 : r - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [visible, url, expiresInSeconds]);

  useEffect(() => {
    if (visible && remaining === 0) onClose();
  }, [remaining, visible, onClose]);

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: '#000' }]}>
        <Pressable style={styles.close} onPress={onClose} hitSlop={16}>
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
        {loading ? (
          <ActivityIndicator size="large" color="#fff" />
        ) : url ? (
          <>
            <Image source={{ uri: url }} style={styles.image} contentFit="contain" />
            <View style={styles.timer}>
              <Text style={styles.timerText}>{remaining}s</Text>
            </View>
          </>
        ) : (
          <Text style={{ color: theme.textInverse }}>Could not load photo</Text>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', top: 56, right: 20, zIndex: 2 },
  image: { width: '100%', height: '100%' },
  timer: {
    position: 'absolute',
    top: 56,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  timerText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
