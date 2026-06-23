import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, FontFamily, DisplayFont } from '../../src/theme';
import { ReportSheet } from '../../src/components/ReportSheet';
import { UpgradeModal } from '../../src/components/UpgradeModal';
import {
  getPublicProfile,
  getUserAlbums,
  startConversation,
  sendMessage,
  tapUser,
  untapUser,
  shortlistUser,
  unshortlistUser,
  blockUser,
  ApiError,
} from '../../src/services/api';
import { useChatStore } from '../../src/store/chatStore';
import { useGridStore } from '../../src/store/gridStore';
import { useAuthStore } from '../../src/store/authStore';
import { showError } from '../../src/lib/toast';
import { planBadgeColor, labelize } from '../../src/lib/format';
import type { PublicProfile, AlbumSummary } from '../../src/types/api';

export default function ProfileDetail() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const peerId = Array.isArray(rawId) ? rawId[0] : rawId ?? '';
  const router = useRouter();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const me = useAuthStore((s) => s.user);
  const patchCard = useGridStore((s) => s.patchCard);
  const { fetchConversations } = useChatStore();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [liked, setLiked] = useState(false);
  const [shortlisted, setShortlisted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [kbInset, setKbInset] = useState(0);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    hasLoadedRef.current = false;
    setLoading(true);
    setProfile(null);
    setNotFound(false);
    setDraft('');
  }, [peerId]);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => setKbInset(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvt, () => setKbInset(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const loadProfile = useCallback(async () => {
    if (!peerId) {
      setLoading(false);
      return;
    }
    if (!hasLoadedRef.current) setLoading(true);
    try {
      const p = await getPublicProfile(peerId);
      setProfile(p);
      setLiked(!!p.isLiked);
      setShortlisted(!!p.isShortlisted);
      setNotFound(false);
      hasLoadedRef.current = true;
    } catch (e) {
      if ((e as ApiError).status === 404) setNotFound(true);
    } finally {
      setLoading(false);
    }
    try {
      const res = await getUserAlbums(peerId);
      setAlbums(res.albums);
    } catch {
      /* albums optional */
    }
  }, [peerId]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const handleCapError = (e: unknown) => {
    const err = e as ApiError;
    if (err.status === 403 && err.code === 'interaction_limit_reached') setUpgradeOpen(true);
  };

  // Open the full chat thread.
  const openChat = async () => {
    if (!peerId) return;
    try {
      const conv = await startConversation(peerId);
      router.push({ pathname: '/chat/[id]', params: { id: conv.id, peerName: profile?.firstName ?? '' } });
    } catch (e) {
      handleCapError(e);
    }
  };

  const sendInline = async () => {
    const text = draft.trim();
    if (!text || sending || !peerId || !me) return;
    setSending(true);
    try {
      const conv = await startConversation(peerId);
      await sendMessage(conv.id, { type: 'text', content: text });
      setDraft('');
      await fetchConversations('inbox', true);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 403 && err.code === 'interaction_limit_reached') setUpgradeOpen(true);
      else showError(err.message ?? 'Could not send message');
    } finally {
      setSending(false);
    }
  };

  const toggleTap = async () => {
    if (!peerId) return;
    const next = !liked;
    setLiked(next);
    patchCard(peerId, { isLiked: next });
    try {
      if (next) await tapUser(peerId);
      else await untapUser(peerId);
    } catch (e) {
      setLiked(!next);
      patchCard(peerId, { isLiked: !next });
      handleCapError(e);
    }
  };

  const toggleShortlist = async () => {
    if (!peerId) return;
    const next = !shortlisted;
    setShortlisted(next);
    patchCard(peerId, { isShortlisted: next });
    try {
      if (next) await shortlistUser(peerId);
      else await unshortlistUser(peerId);
    } catch (e) {
      setShortlisted(!next);
      patchCard(peerId, { isShortlisted: !next });
      handleCapError(e);
    }
  };

  const confirmBlock = () => {
    setMenuOpen(false);
    Alert.alert('Block user', 'They won’t be able to see you or message you. This is mutual.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          try {
            await blockUser(peerId);
            router.back();
          } catch {
            Alert.alert('Could not block', 'Please try again.');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.brand} size="large" />
      </View>
    );
  }

  if (notFound || !profile) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.background }]}>
        <Ionicons name="person-remove-outline" size={48} color={theme.textTertiary} />
        <Text style={[styles.naTitle, { color: theme.textPrimary }]}>Profile not available</Text>
        <Pressable style={[styles.naBtn, { backgroundColor: theme.brand }]} onPress={() => router.back()}>
          <Text style={[styles.naBtnText, { color: theme.textInverse }]}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const badge = planBadgeColor(theme, profile.planBadge);
  const gallery = profile.photos?.length ? profile.photos.map((ph) => ph.url) : profile.profilePhoto ? [profile.profilePhoto] : [];
  const online = profile.activity?.online ?? profile.lastActiveAt?.toLowerCase() === 'online';

  const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <>
      <Text style={[styles.sectionLabel, { color: theme.textTertiary }]}>{label}</Text>
      {children}
    </>
  );

  const Chips = ({ items }: { items: string[] }) => (
    <View style={styles.chips}>
      {items.map((t, i) => (
        <View key={`${t}-${i}`} style={[styles.chip, { backgroundColor: theme.surfaceElevated }]}>
          <Text style={[styles.chipText, { color: theme.textPrimary }]}>{labelize(t)}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Hero / gallery */}
        <View style={{ width, height: width }}>
          {gallery.length > 0 ? (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
              {gallery.map((uri, i) => (
                <Image key={i} source={{ uri }} style={{ width, height: width }} contentFit="cover" />
              ))}
            </ScrollView>
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.noPhoto, { backgroundColor: theme.backgroundTertiary }]}>
              <Ionicons name="person" size={96} color={theme.textTertiary} />
            </View>
          )}
          {/* Top scrim — keeps the back / star / menu buttons legible over bright photos */}
          <LinearGradient
            colors={['rgba(0,0,0,0.45)', 'transparent']}
            style={styles.heroTopScrim}
            pointerEvents="none"
          />
          {/* Bottom scrim — warm fade into the info section */}
          <LinearGradient
            colors={['transparent', theme.background]}
            style={styles.heroBottomScrim}
            pointerEvents="none"
          />
          <SafeAreaView edges={['top']} style={styles.heroBar}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.circleBtn}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </Pressable>
            <View style={styles.heroRight}>
              <Pressable style={styles.circleBtn} onPress={toggleShortlist}>
                <Ionicons name={shortlisted ? 'star' : 'star-outline'} size={20} color={shortlisted ? theme.planGold : '#fff'} />
              </Pressable>
              <Pressable style={styles.circleBtn} onPress={() => setMenuOpen(true)}>
                <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
              </Pressable>
            </View>
          </SafeAreaView>
        </View>

        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: theme.textPrimary }]}>
              {profile.firstName ?? 'Someone'}
              {profile.age ? <Text style={styles.age}>, {profile.age}</Text> : null}
            </Text>
            {profile.isVerified && <Ionicons name="checkmark-circle" size={20} color={theme.info} />}
            {badge && (
              <View style={[styles.planBadge, { backgroundColor: badge }]}>
                <Ionicons name="diamond" size={11} color="#000" />
              </View>
            )}
          </View>

          <View style={styles.metaRow}>
            <View style={[styles.dot, { backgroundColor: online ? theme.online : theme.textTertiary }]} />
            <Text style={[styles.meta, { color: online ? theme.online : theme.textSecondary }]}>{online ? 'Online now' : profile.activity?.label ?? 'Offline'}</Text>
            <Ionicons name="navigate" size={13} color={theme.textSecondary} style={{ marginLeft: 8 }} />
            <Text style={[styles.meta, { color: theme.textSecondary }]}> {profile.distance}</Text>
          </View>

          {/* Verification badges */}
          {(profile.photoVerified || profile.faceVerified || profile.isCollegeVerified) && (
            <View style={styles.verifyRow}>
              {profile.photoVerified && <Badge theme={theme} icon="image" label="Photo verified" />}
              {profile.faceVerified && <Badge theme={theme} icon="happy" label="Face verified" />}
              {profile.isCollegeVerified && <Badge theme={theme} icon="school" label="College" />}
            </View>
          )}

          {/* Physical stats */}
          {(profile.height || profile.weight || profile.bodyType || profile.skinTone) && (
            <View style={styles.statsRow}>
              {profile.height ? <Stat theme={theme} text={`${profile.height} cm`} /> : null}
              {profile.weight ? <Stat theme={theme} text={`${profile.weight} kg`} /> : null}
              {profile.bodyType ? <Stat theme={theme} text={labelize(profile.bodyType)} /> : null}
              {profile.skinTone ? <Stat theme={theme} text={labelize(profile.skinTone)} /> : null}
            </View>
          )}

          {profile.bio ? (
            <Section label="BIO">
              <Text style={[styles.body, { color: theme.textSecondary }]}>{profile.bio}</Text>
            </Section>
          ) : null}

          {profile.aboutMe ? (
            <Section label="ABOUT ME">
              <View style={[styles.card, { backgroundColor: theme.surface }]}>
                <Text style={[styles.body, { color: theme.textSecondary }]}>{profile.aboutMe}</Text>
              </View>
            </Section>
          ) : null}

          {profile.whereAreYouFrom ? (
            <Section label="FROM">
              <Text style={[styles.body, { color: theme.textSecondary }]}>{profile.whereAreYouFrom}</Text>
            </Section>
          ) : null}

          {profile.relationshipStatus ? (
            <Section label="RELATIONSHIP STATUS">
              <Text style={[styles.body, { color: theme.textSecondary }]}>{labelize(profile.relationshipStatus)}</Text>
            </Section>
          ) : null}

          {profile.lookingFor?.length ? (
            <Section label="LOOKING FOR">
              <Chips items={profile.lookingFor} />
            </Section>
          ) : null}

          {profile.whereWeCanMeet?.length ? (
            <Section label="WHERE WE CAN MEET">
              <Chips items={profile.whereWeCanMeet} />
            </Section>
          ) : null}

          {profile.datingIntentions?.length ? (
            <Section label="DATING INTENTIONS">
              <Chips items={profile.datingIntentions} />
            </Section>
          ) : null}

          {profile.fantasyTags?.length ? (
            <Section label="FANTASY TAGS">
              <Chips items={profile.fantasyTags} />
            </Section>
          ) : null}

          {profile.tribes?.length ? (
            <Section label="TRIBES">
              <Chips items={profile.tribes} />
            </Section>
          ) : null}

          {profile.interests?.length ? (
            <Section label="INTERESTS">
              <Chips items={profile.interests} />
            </Section>
          ) : null}

          {profile.tags?.length ? (
            <Section label="TAGS">
              <Chips items={profile.tags} />
            </Section>
          ) : null}

          {(profile.voiceClipUrl || profile.videoClipUrl) && (
            <Section label="INTRO">
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {profile.voiceClipUrl && <MediaPill theme={theme} icon="mic" label="Voice intro" />}
                {profile.videoClipUrl && <MediaPill theme={theme} icon="videocam" label="Video intro" />}
              </View>
            </Section>
          )}

          {profile.prompts?.length ? (
            <Section label="PROMPTS">
              {profile.prompts.map((pr) => (
                <View key={pr.id} style={[styles.card, { backgroundColor: theme.surface }]}>
                  <Text style={[styles.promptQ, { color: theme.textTertiary }]}>{pr.question}</Text>
                  <Text style={[styles.promptA, { color: theme.textPrimary }]}>{pr.answer}</Text>
                </View>
              ))}
            </Section>
          ) : null}

          {albums.length > 0 ? (
            <Section label="ALBUMS">
              <View style={styles.albumGrid}>
                {albums.map((a) => (
                  <Pressable
                    key={a.id}
                    style={[styles.albumTile, { backgroundColor: theme.backgroundTertiary }]}
                    onPress={() => router.push({ pathname: '/albums/[id]', params: { id: a.id, title: a.title } })}
                  >
                    {a.coverPhoto ? (
                      <Image source={{ uri: a.coverPhoto.url }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, styles.noPhoto]}>
                        <Ionicons name="images" size={28} color={theme.textTertiary} />
                      </View>
                    )}
                    <View style={styles.albumShade} />
                    <View style={styles.albumMeta}>
                      <Text style={styles.albumName} numberOfLines={1}>{a.title}</Text>
                      <View style={styles.albumCount}>
                        <Ionicons name="images" size={11} color="#fff" />
                        <Text style={styles.albumCountText}>{a.photoCount}</Text>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            </Section>
          ) : null}
        </View>
      </ScrollView>

      <KeyboardAvoidingView
        style={styles.barWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <SafeAreaView
          edges={['bottom']}
          style={{
            backgroundColor: theme.background,
            borderTopWidth: 1,
            borderTopColor: theme.border,
            paddingBottom: Platform.OS === 'android' ? Math.max(0, kbInset - 24) : 0,
          }}
        >
          <View style={styles.bar}>
            <View style={[styles.inputWrap, { backgroundColor: theme.surfaceElevated }]}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Write a message…"
                placeholderTextColor={theme.textTertiary}
                style={[styles.input, { color: theme.textPrimary }]}
                multiline
                maxLength={1000}
                blurOnSubmit={false}
              />
              {draft.trim().length > 0 && (
                <Pressable onPress={sendInline} disabled={sending} hitSlop={8} style={styles.sendBtn}>
                  {sending ? (
                    <ActivityIndicator size="small" color={theme.brand} />
                  ) : (
                    <Ionicons name="arrow-up-circle" size={30} color={theme.brand} />
                  )}
                </Pressable>
              )}
            </View>
            <Pressable style={[styles.iconAction, { backgroundColor: theme.surfaceElevated }]} onPress={toggleTap}>
              <Ionicons name="flame" size={24} color={liked ? theme.brand : theme.textSecondary} />
            </Pressable>
            <Pressable onPress={openChat}>
              <LinearGradient
                colors={theme.gradientWarm}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconAction}
              >
                <Ionicons name="chatbubble" size={20} color="#fff" />
              </LinearGradient>
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>

      {/* Action menu */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={[styles.overlay, { backgroundColor: theme.overlay }]} onPress={() => setMenuOpen(false)}>
          <View style={[styles.menu, { backgroundColor: theme.surface }]}>
            <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); setReportOpen(true); }}>
              <Ionicons name="flag-outline" size={20} color={theme.textPrimary} />
              <Text style={[styles.menuText, { color: theme.textPrimary }]}>Report</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={confirmBlock}>
              <Ionicons name="ban-outline" size={20} color={theme.error} />
              <Text style={[styles.menuText, { color: theme.error }]}>Block</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <ReportSheet visible={reportOpen} userId={peerId} onClose={() => setReportOpen(false)} />
      <UpgradeModal visible={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </View>
  );
}

function Stat({ theme, text }: { theme: any; text: string }) {
  return (
    <View style={[styles.statPill, { backgroundColor: theme.surfaceElevated }]}>
      <Text style={[styles.statText, { color: theme.textPrimary }]}>{text}</Text>
    </View>
  );
}
function Badge({ theme, icon, label }: { theme: any; icon: any; label: string }) {
  return (
    <View style={[styles.vBadge, { backgroundColor: theme.info + '22' }]}>
      <Ionicons name={icon} size={13} color={theme.info} />
      <Text style={[styles.vBadgeText, { color: theme.info }]}>{label}</Text>
    </View>
  );
}
function MediaPill({ theme, icon, label }: { theme: any; icon: any; label: string }) {
  return (
    <Pressable style={[styles.mediaPill, { backgroundColor: theme.surfaceElevated }]}>
      <Ionicons name={icon} size={18} color={theme.brand} />
      <Text style={[styles.mediaText, { color: theme.textPrimary }]}>{label}</Text>
      <Ionicons name="play" size={14} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  naTitle: { fontSize: 18, fontFamily: DisplayFont.bold, fontWeight: '700' },
  naBtn: { marginTop: 8, height: 46, borderRadius: 999, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' },
  naBtnText: { fontSize: 15, fontFamily: DisplayFont.bold, fontWeight: '700' },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  heroTopScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 120 },
  heroBottomScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 140 },
  heroBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  heroRight: { flexDirection: 'row', gap: 10 },
  circleBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  info: { padding: 20, gap: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 28, fontFamily: DisplayFont.heavy, fontWeight: '800' },
  age: { fontFamily: DisplayFont.regular, fontWeight: '400' },
  planBadge: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  meta: { fontSize: 14, fontFamily: FontFamily.medium },
  verifyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  vBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  vBadgeText: { fontSize: 12, fontFamily: FontFamily.semibold, fontWeight: '600' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  statPill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  statText: { fontSize: 13, fontFamily: FontFamily.semibold, fontWeight: '600' },
  sectionLabel: { fontSize: 12, fontFamily: DisplayFont.bold, fontWeight: '700', letterSpacing: 0.8, marginTop: 20 },
  body: { fontSize: 15, fontFamily: FontFamily.regular, lineHeight: 22, marginTop: 6 },
  card: { borderRadius: 16, padding: 14, marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 14, fontFamily: FontFamily.medium },
  promptQ: { fontSize: 13, fontFamily: FontFamily.regular },
  promptA: { fontSize: 16, fontFamily: DisplayFont.semibold, fontWeight: '600', marginTop: 4 },
  mediaPill: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, marginTop: 8 },
  mediaText: { fontSize: 14, fontFamily: FontFamily.semibold, fontWeight: '600' },
  barWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 24, paddingLeft: 16, paddingRight: 6, minHeight: 48 },
  input: { flex: 1, fontSize: 15, fontFamily: FontFamily.regular, paddingVertical: 12, maxHeight: 110 },
  sendBtn: { marginLeft: 4, alignItems: 'center', justifyContent: 'center' },
  iconAction: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  albumTile: { width: '31.5%', aspectRatio: 1, borderRadius: 14, overflow: 'hidden', justifyContent: 'flex-end' },
  albumShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%', backgroundColor: 'rgba(0,0,0,0.4)' },
  albumMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 6 },
  albumName: { color: '#fff', fontSize: 12, fontFamily: DisplayFont.bold, fontWeight: '700', flex: 1, textShadowColor: '#000', textShadowRadius: 3 },
  albumCount: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  albumCountText: { color: '#fff', fontSize: 10, fontFamily: FontFamily.bold, fontWeight: '700' },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  menu: { width: '100%', borderRadius: 16, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  menuText: { fontSize: 16, fontFamily: FontFamily.semibold, fontWeight: '600' },
});
