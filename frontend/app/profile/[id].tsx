import { useEffect, useState } from 'react';
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
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';
import { ReportSheet } from '../../src/components/ReportSheet';
import { UpgradeModal } from '../../src/components/UpgradeModal';
import {
  getPublicProfile,
  startConversation,
  tapUser,
  shortlistUser,
  unshortlistUser,
  blockUser,
  ApiError,
} from '../../src/services/api';
import { planBadgeColor, labelize } from '../../src/lib/format';
import type { PublicProfile } from '../../src/types/api';

export default function ProfileDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [liked, setLiked] = useState(false);
  const [shortlisted, setShortlisted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await getPublicProfile(id);
        if (!active) return;
        setProfile(p);
        setLiked(p.isLiked);
        setShortlisted(p.isShortlisted);
      } catch (e) {
        if ((e as ApiError).status === 404) setNotFound(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const handleCapError = (e: unknown) => {
    const err = e as ApiError;
    if (err.status === 403 && err.code === 'interaction_limit_reached') setUpgradeOpen(true);
  };

  const message = async () => {
    try {
      const conv = await startConversation(id);
      router.push({ pathname: '/chat/[id]', params: { id: conv.id, peerName: profile?.firstName ?? '' } });
    } catch (e) {
      handleCapError(e);
    }
  };

  const toggleTap = async () => {
    const next = !liked;
    setLiked(next);
    try {
      if (next) await tapUser(id);
    } catch (e) {
      setLiked(!next);
      handleCapError(e);
    }
  };

  const toggleShortlist = async () => {
    const next = !shortlisted;
    setShortlisted(next);
    try {
      if (next) await shortlistUser(id);
      else await unshortlistUser(id);
    } catch (e) {
      setShortlisted(!next);
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
            await blockUser(id);
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
  const online = profile.lastActiveAt?.toLowerCase() === 'online';

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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
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
          <SafeAreaView edges={['top']} style={styles.heroBar}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.circleBtn}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </Pressable>
            <Pressable style={styles.circleBtn} onPress={() => setMenuOpen(true)}>
              <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
            </Pressable>
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
            <Text style={[styles.meta, { color: theme.textSecondary }]}>{online ? 'Online now' : profile.lastActiveAt}</Text>
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
        </View>
      </ScrollView>

      {/* Action bar */}
      <SafeAreaView edges={['bottom']} style={[styles.barWrap, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
        <View style={styles.bar}>
          <Pressable style={[styles.iconAction, { backgroundColor: theme.surfaceElevated }]} onPress={toggleShortlist}>
            <Ionicons name={shortlisted ? 'star' : 'star-outline'} size={22} color={shortlisted ? theme.planGold : theme.textPrimary} />
          </Pressable>
          <Pressable style={[styles.iconAction, { backgroundColor: theme.surfaceElevated }]} onPress={toggleTap}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={22} color={liked ? theme.brand : theme.textPrimary} />
          </Pressable>
          <Pressable style={[styles.messageBtn, { backgroundColor: theme.brand }]} onPress={message}>
            <Ionicons name="chatbubble" size={18} color={theme.textInverse} />
            <Text style={[styles.messageText, { color: theme.textInverse }]}>Message</Text>
          </Pressable>
        </View>
      </SafeAreaView>

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

      <ReportSheet visible={reportOpen} userId={id} onClose={() => setReportOpen(false)} />
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
  naTitle: { fontSize: 18, fontWeight: '700' },
  naBtn: { marginTop: 8, height: 46, borderRadius: 999, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' },
  naBtnText: { fontSize: 15, fontWeight: '700' },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  heroBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  circleBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  info: { padding: 20, gap: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 26, fontWeight: '800' },
  age: { fontWeight: '400' },
  planBadge: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  meta: { fontSize: 14 },
  verifyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  vBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  vBadgeText: { fontSize: 12, fontWeight: '600' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  statPill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  statText: { fontSize: 13, fontWeight: '600' },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginTop: 20 },
  body: { fontSize: 15, lineHeight: 22, marginTop: 6 },
  card: { borderRadius: 14, padding: 14, marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 14 },
  promptQ: { fontSize: 13 },
  promptA: { fontSize: 16, fontWeight: '600', marginTop: 4 },
  mediaPill: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, marginTop: 8 },
  mediaText: { fontSize: 14, fontWeight: '600' },
  barWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  iconAction: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  messageBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 999 },
  messageText: { fontSize: 16, fontWeight: '700' },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  menu: { width: '100%', borderRadius: 16, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  menuText: { fontSize: 16, fontWeight: '600' },
});
