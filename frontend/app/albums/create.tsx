import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useTheme, FontFamily, DisplayFont } from '../../src/theme';
import { CustomAlert } from '../../src/components/CustomAlert';
import { useAlert } from '../../src/hooks/useAlert';
import { createAlbum, uploadAlbumPhoto, ApiError } from '../../src/services/api';

export default function CreateAlbum() {
  const router = useRouter();
  const { theme } = useTheme();
  const { alertConfig, hideAlert, showAlert, alertError } = useAlert();

  const [title, setTitle] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedCount, setSelectedCount] = useState(0);
  const [busy, setBusy] = useState(false);

  const pickAndCreate = async (
    source: 'camera' | 'photo' | 'video'
  ) => {
    if (busy) return;
    let res: ImagePicker.ImagePickerResult;
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
      res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: source === 'video' ? ['videos'] : ['images'],
        quality: 0.8,
        // Let users pick several photos at once to seed the album.
        allowsMultipleSelection: source === 'photo',
        orderedSelection: source === 'photo',
      });
    }
    if (res.canceled || res.assets.length === 0) return;
    const assets = res.assets;
    setPreview(assets[0].uri);
    setSelectedCount(assets.length);
    setBusy(true);
    try {
      const album = await createAlbum(title.trim() || 'My Album');
      // Upload every selected photo in order into the new album.
      for (const asset of assets) {
        await uploadAlbumPhoto(album.id, asset.uri);
      }
      router.replace({ pathname: '/albums/edit', params: { id: album.id, title: album.title } });
    } catch (e) {
      const err = e as ApiError;
      setPreview(null);
      setSelectedCount(0);
      if (err.status === 403) {
        showAlert({
          title: 'Album limit reached',
          message: 'Upgrade your plan to create more albums.',
          icon: 'lock-closed',
          iconColor: theme.warning,
          buttons: [
            { label: 'Not now', style: 'cancel', onPress: hideAlert },
            { label: 'Upgrade', style: 'default', onPress: () => { hideAlert(); router.replace('/(tabs)/store'); } },
          ],
        });
      } else {
        alertError('Could not create album', err.message ?? 'Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const SourceBtn = ({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) => (
    <Pressable style={[styles.sourceBtn, { borderColor: theme.border }]} onPress={onPress} disabled={busy}>
      <Ionicons name={icon} size={20} color={theme.textPrimary} />
      <Text style={[styles.sourceLabel, { color: theme.textPrimary }]}>{label}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.screenTitle, { color: theme.textPrimary }]}>Create Album</Text>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={26} color={theme.textPrimary} />
        </Pressable>
      </View>

      <Text style={[styles.heading, { color: theme.textPrimary }]}>Add a photo to start your album</Text>

      <View style={styles.topRow}>
        <View style={[styles.coverCard, { backgroundColor: theme.surfaceElevated }]}>
          {preview ? (
            <Image source={{ uri: preview }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
          ) : (
            <Ionicons name="person-circle" size={92} color={theme.textTertiary} />
          )}
          {busy && (
            <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </View>

        <View style={styles.nameCol}>
          <View style={styles.nameRow}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Album Name"
              placeholderTextColor={theme.textTertiary}
              maxLength={50}
              style={[styles.nameInput, { color: theme.textPrimary, borderBottomColor: theme.border }]}
            />
            <Ionicons name="pencil" size={18} color={theme.textTertiary} />
          </View>
          <Text style={[styles.hint, { color: theme.textTertiary }]}>Only you see the album name</Text>
          <Text style={[styles.hint, { color: theme.textTertiary, marginTop: 10 }]}>{selectedCount} items</Text>
        </View>
      </View>

      <View style={styles.sources}>
        <SourceBtn icon="camera" label="Take Photo" onPress={() => pickAndCreate('camera')} />
        <SourceBtn icon="images" label="Photo Library" onPress={() => pickAndCreate('photo')} />
        <SourceBtn icon="videocam" label="Video Library" onPress={() => pickAndCreate('video')} />
      </View>

      <Pressable
        style={styles.whatBtn}
        onPress={() =>
          showAlert({
            title: "What's an Album?",
            message: 'Albums are private photo sets you can share with people you chat with. Only people you grant access can see them.',
            icon: 'information-circle',
            iconColor: theme.info,
            buttons: [{ label: 'Got it', style: 'default', onPress: hideAlert }],
          })
        }
      >
        <Text style={[styles.whatText, { color: theme.brandSecondary }]}>What's an Album?</Text>
      </Pressable>

      {alertConfig ? <CustomAlert visible onDismiss={hideAlert} {...alertConfig} /> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 },
  screenTitle: { fontSize: 22, fontFamily: DisplayFont.bold, fontWeight: '700' },
  heading: { fontSize: 22, fontFamily: DisplayFont.bold, fontWeight: '800', textAlign: 'center', marginTop: 24, marginBottom: 28, paddingHorizontal: 24 },
  topRow: { flexDirection: 'row', gap: 20, paddingHorizontal: 20, alignItems: 'flex-start' },
  coverCard: { width: 128, height: 168, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  nameCol: { flex: 1, paddingTop: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameInput: { flex: 1, fontSize: 22, fontFamily: DisplayFont.regular, borderBottomWidth: 1, paddingBottom: 8 },
  hint: { fontSize: 14, fontFamily: FontFamily.regular, marginTop: 12 },
  sources: { paddingHorizontal: 20, marginTop: 40, gap: 14 },
  sourceBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 52, borderRadius: 999, borderWidth: 1 },
  sourceLabel: { fontSize: 16, fontFamily: DisplayFont.semibold, fontWeight: '600' },
  whatBtn: { marginTop: 'auto', alignItems: 'center', paddingVertical: 24 },
  whatText: { fontSize: 16, fontFamily: DisplayFont.semibold, fontWeight: '700' },
});
