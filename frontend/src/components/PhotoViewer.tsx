import { Modal, View, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  visible: boolean;
  url: string | null;
  onClose: () => void;
}

export function PhotoViewer({ visible, url, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.close} onPress={onClose} hitSlop={16}>
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
        {url ? <Image source={{ uri: url }} style={styles.image} contentFit="contain" /> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', top: 56, right: 20, zIndex: 2 },
  image: { width: '100%', height: '100%' },
});
