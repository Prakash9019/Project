import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { RemoteImage } from '../../src/components/RemoteImage';
import { Skeleton } from '../../src/components/Skeleton';
import { Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter, useFocusEffect, type Href } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, FontFamily, DisplayFont, FontSize } from '../../src/theme';
import { ReportSheet } from '../../src/components/ReportSheet';
import { UpgradeModal } from '../../src/components/UpgradeModal';
import { AudioPlayer } from '../../src/components/chat/AudioPlayer';
import {
  getPublicProfile,
  getUserAlbums,
  startConversation,
  sendMessage,
  listMessages,
  listJoinedRooms,
  getUserRooms,
  tapUser,
  untapUser,
  shortlistUser,
  unshortlistUser,
  blockUser,
  getCompatibility,
  ApiError,
  type UserRoomCard,
} from '../../src/services/api';
import { MediaViewer, type MediaViewerImage } from '../../src/components/MediaViewer';
import { categoryMeta } from '../../src/lib/rooms';
import { useChatStore } from '../../src/store/chatStore';
import { useGridStore } from '../../src/store/gridStore';
import { useAuthStore } from '../../src/store/authStore';
import { showError } from '../../src/lib/toast';
import { planBadgeColor, labelize } from '../../src/lib/format';
import type { PublicProfile, AlbumSummary } from '../../src/types/api';

type SharedLink = { id: string; url: string };

// In-memory profile cache (module-scoped, session-lifetime). Lets a re-opened
// profile render instantly from the last-seen data while it revalidates in the
// background, instead of showing a cold skeleton every visit (F44/Fix 8C).
const profileCache = new Map<string, PublicProfile>();

// How many hero photos to eagerly load on mount; the rest load as the user
// swipes toward them (F52 progressive photo loading).
const INITIAL_PHOTOS = 4;

export default function ProfileDetail() {
  const params = useLocalSearchParams<{ id: string; fromChat?: string; peerName?: string }>();
  const rawId = params.id;
  const peerId = Array.isArray(rawId) ? rawId[0] : rawId ?? '';
  const fromChat = Array.isArray(params.fromChat) ? params.fromChat[0] : params.fromChat;
  const router = useRouter();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const keyboard = useAnimatedKeyboard({
    isStatusBarTranslucentAndroid: true,
    isNavigationBarTranslucentAndroid: true,
  });
  const animatedBarStyle = useAnimatedStyle(() => {
    const offset = keyboard.height.value > 0 ? Math.max(0, keyboard.height.value - insets.bottom) : 0;
    return {
      transform: [{ translateY: -offset }],
    };
  });
  const me = useAuthStore((s) => s.user);
  const patchCard = useGridStore((s) => s.patchCard);
  const fetchConversations = useChatStore((s) => s.fetchConversations);

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [voiceIntroExpanded, setVoiceIntroExpanded] = useState(false);
  const [videoIntroOpen, setVideoIntroOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [liked, setLiked] = useState(false);
  const [shortlisted, setShortlisted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [blockConfirming, setBlockConfirming] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const hasLoadedRef = useRef(false);

  // In-chat contact profile extras (only when opened from a conversation).
  const [sharedImages, setSharedImages] = useState<MediaViewerImage[]>([]);
  const [sharedLinks, setSharedLinks] = useState<SharedLink[]>([]);
  const [mutualGroups, setMutualGroups] = useState<UserRoomCard[]>([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  // Number of hero photos currently permitted to load (grows as the user swipes).
  const [visiblePhotos, setVisiblePhotos] = useState(INITIAL_PHOTOS);
  const [heroIndex, setHeroIndex] = useState(0);

  // AI Compatibility (Platinum, opt-in) — fetched independently of the profile
  // itself so a slow/failed AI call never blocks or delays the profile render.
  const [compatibility, setCompatibility] = useState<{ score: number; breakdown: string[] } | null>(null);
  const [compatLoading, setCompatLoading] = useState(false);
  const [compatLockedReason, setCompatLockedReason] = useState<'plan_required' | null>(null);

  useEffect(() => {
    hasLoadedRef.current = false;
    setNotFound(false);
    setDraft('');
    setVisiblePhotos(INITIAL_PHOTOS);
    setHeroIndex(0);
    setCompatibility(null);
    setCompatLockedReason(null);
    // Instant paint from cache on a repeat visit, then revalidate silently.
    const cached = profileCache.get(peerId);
    if (cached) {
      setProfile(cached);
      setLiked(!!cached.isLiked);
      setShortlisted(!!cached.isShortlisted);
      setLoading(false);
      hasLoadedRef.current = true; // don't flip back to the skeleton while revalidating
    } else {
      setProfile(null);
      setLoading(true);
    }
  }, [peerId]);

  const loadProfile = useCallback(async () => {
    if (!peerId) {
      setLoading(false);
      return;
    }
    if (!hasLoadedRef.current) setLoading(true);
    try {
      const p = await getPublicProfile(peerId);
      profileCache.set(peerId, p);
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

  // AI Compatibility (Platinum, opt-in) — independent of loadProfile so it never
  // delays or blocks the profile itself. A 403 (not Platinum, or opted out) or any
  // other failure just hides the section instead of showing a broken/empty card —
  // except plan_required, which shows the existing upgrade pattern (UpgradeModal).
  useEffect(() => {
    if (!peerId || peerId === me?.id) return;
    let active = true;
    setCompatLoading(true);
    getCompatibility(peerId)
      .then((res) => {
        if (active) setCompatibility(res);
      })
      .catch((e) => {
        if (!active) return;
        const err = e as ApiError;
        setCompatLockedReason(err.status === 403 && err.code === 'plan_required' ? 'plan_required' : null);
      })
      .finally(() => {
        if (active) setCompatLoading(false);
      });
    return () => { active = false; };
  }, [peerId, me?.id]);

  // When opened from a chat, load shared media/links + mutual groups.
  useEffect(() => {
    if (!fromChat || !peerId) return;
    let active = true;
    (async () => {
      try {
        const res = await listMessages(fromChat, { limit: 100 });
        if (!active) return;
        const images: MediaViewerImage[] = [];
        const links: SharedLink[] = [];
        for (const m of res.messages) {
          if (m.isUnsent) continue;
          if (m.type === 'photo' && !m.viewOnce) {
            const urls = m.mediaUrls.length ? m.mediaUrls : m.mediaUrl ? [m.mediaUrl] : [];
            urls.forEach((uri) => {
              if (uri) images.push({ uri, senderId: m.senderId, senderName: m.senderId === me?.id ? 'You' : params.peerName || profile?.firstName || 'Someone', createdAt: m.createdAt });
            });
          } else if (m.type === 'text' && m.content) {
            const match = m.content.match(/(https?:\/\/[^\s]+)|(www\.[^\s]+)/i);
            if (match) {
              const raw = match[0];
              links.push({ id: m.id, url: raw.startsWith('http') ? raw : `https://${raw}` });
            }
          }
        }
        setSharedImages(images);
        setSharedLinks(links);
      } catch {
        /* shared content is optional */
      }
      try {
        const [mine, theirs] = await Promise.all([listJoinedRooms(), getUserRooms(peerId)]);
        if (!active) return;
        const myIds = new Set(mine.rooms.map((r) => r.id));
        setMutualGroups(theirs.rooms.filter((r) => myIds.has(r.id)));
      } catch {
        /* mutual groups optional */
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromChat, peerId]);

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

  const closeMenu = () => {
    setMenuOpen(false);
    setBlockConfirming(false);
    setBlockError(null);
  };

  // Swaps the action-menu Modal's own content to a confirm step instead of
  // closing it and presenting a second native <Modal> for the confirmation.
  // Two native Modals transitioning (one closing, one opening) in the same
  // tick race the modal host on Android — the incoming modal can render but
  // never reliably receive touches, and a fixed setTimeout delay is not a
  // real completion signal (a slow/loaded device can still lose the race).
  // Reusing the single already-open Modal removes the race entirely.
  const confirmBlock = () => setBlockConfirming(true);

  const doBlock = async () => {
    if (blocking) return;
    setBlocking(true);
    setBlockError(null);
    try {
      await blockUser(peerId);
      closeMenu();
      router.back();
    } catch {
      // Keep the sheet open and show the error inline (rather than closing
      // this Modal and presenting a separate one) — same race this whole
      // confirm step was restructured to avoid.
      setBlockError('Could not block. Please try again.');
    } finally {
      setBlocking(false);
    }
  };

  if (loading) {
    // Skeleton mirroring the profile layout (hero → name → chips → bio → 2×2
    // photo grid) so navigating in never flashes blank (Fix 3 / Fix 8A).
    return (
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        <Skeleton width={width} height={width} radius={0} />
        <View style={{ padding: 20, gap: 14 }}>
          <Skeleton width="60%" height={24} radius={6} />
          <Skeleton width="40%" height={16} radius={6} />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <Skeleton width={70} height={28} radius={14} />
            <Skeleton width={90} height={28} radius={14} />
            <Skeleton width={60} height={28} radius={14} />
          </View>
          <Skeleton width="100%" height={72} radius={12} style={{ marginTop: 8 }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} width={(width - 48) / 2} height={(width - 48) / 2} radius={12} />
            ))}
          </View>
        </View>
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
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionHeader}>{label}</Text>
      {children}
    </View>
  );

  const Chips = ({ items }: { items: string[] }) => (
    <View style={styles.chips}>
      {items.map((t, i) => (
        <View key={`${t}-${i}`} style={styles.chip}>
          <Text style={styles.chipText}>{labelize(t)}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.root}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 160 + insets.bottom }}
      >
        {/* Hero / gallery */}
        <View style={{ width, height: width * 1.15 }}>
          {gallery.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / width);
                if (idx + 2 > visiblePhotos) {
                  setVisiblePhotos((n) => Math.min(gallery.length, Math.max(n, idx + 2)));
                }
                if (idx !== heroIndex) setHeroIndex(idx);
              }}
            >
              {gallery.map((uri, i) =>
                i < visiblePhotos ? (
                  <RemoteImage key={i} source={{ uri }} style={{ width, height: width * 1.15 }} contentFit="cover" transition={120} />
                ) : (
                  <View key={i} style={{ width, height: width * 1.15, backgroundColor: '#111111' }} />
                ),
              )}
            </ScrollView>
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.noPhoto, { backgroundColor: '#111111' }]}>
              <Ionicons name="person" size={96} color="#444444" />
            </View>
          )}
          {/* Top scrim — keeps the back / star / menu buttons legible over bright photos */}
          <LinearGradient
            colors={['rgba(0,0,0,0.5)', 'transparent']}
            style={styles.heroTopScrim}
            pointerEvents="none"
          />
          {gallery.length > 1 && (
            <View style={styles.heroDots} pointerEvents="none">
              {gallery.map((_, i) => (
                <View key={i} style={i === heroIndex ? styles.heroDotActive : styles.heroDotInactive} />
              ))}
            </View>
          )}
          <SafeAreaView edges={['top']} style={styles.heroBar}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.circleBtn}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </Pressable>
            <View style={styles.heroRight}>
              <Pressable style={styles.circleBtn} onPress={toggleShortlist}>
                <Ionicons name={shortlisted ? 'star' : 'star-outline'} size={22} color={shortlisted ? '#F5C518' : '#fff'} />
              </Pressable>
              <Pressable style={styles.circleBtn} onPress={() => setMenuOpen(true)}>
                <Ionicons name="ellipsis-horizontal" size={22} color="#fff" />
              </Pressable>
            </View>
          </SafeAreaView>
        </View>

        <View style={styles.info}>
          {/* Name & Age — bold, clean matching screenshot "Place 26" */}
          <View style={styles.nameRow}>
            <Text style={styles.name}>
              {profile.firstName ?? 'Someone'}
              {profile.age ? <Text style={styles.age}> {profile.age}</Text> : null}
            </Text>
            {profile.isVerified && <Ionicons name="checkmark-circle" size={22} color="#00D26A" style={styles.verifyTick} />}
            {badge && (
              <View style={[styles.planBadge, { backgroundColor: badge }]}>
                <Ionicons name="diamond" size={11} color="#000" />
              </View>
            )}
          </View>

          {/* Status & Distance Row */}
          <View style={styles.metaRow}>
            <View style={[styles.dot, { backgroundColor: online ? '#00D26A' : '#8E8E93' }]} />
            <Text style={[styles.metaText, { color: online ? '#00D26A' : '#8E8E93' }]}>
              {online ? 'Online now' : profile.activity?.label ?? 'Offline'}
            </Text>
            {profile.distance ? (
              <View style={styles.distRow}>
                <Ionicons name="navigate" size={13} color="#8E8E93" />
                <Text style={styles.distText}>{profile.distance}</Text>
              </View>
            ) : null}
          </View>

          {/* Availability chips — group / audio / video */}
          {(profile.groupsAvailable || profile.audioCallAvailable || profile.videoCallAvailable) && (
            <View style={styles.availRow}>
              {profile.groupsAvailable && (
                <View style={[styles.availChip, { backgroundColor: '#2C1E3A' }]}>
                  <Text style={[styles.availChipText, { color: '#D495FF' }]}>👥 Open to Groups</Text>
                </View>
              )}
              {profile.audioCallAvailable && (
                <View style={[styles.availChip, { backgroundColor: '#1A2C2A' }]}>
                  <Text style={[styles.availChipText, { color: '#4ADE80' }]}>📞 Audio Calls</Text>
                </View>
              )}
              {profile.videoCallAvailable && (
                <View style={[styles.availChip, { backgroundColor: '#1A2536' }]}>
                  <Text style={[styles.availChipText, { color: '#60A5FA' }]}>🎥 Video Calls</Text>
                </View>
              )}
            </View>
          )}

          {/* Verification badges */}
          {(profile.photoVerified || profile.isCollegeVerified) && (
            <View style={styles.verifyRow}>
              {profile.photoVerified && <Badge icon="image" label="Photo verified" />}
              {profile.isCollegeVerified && <Badge icon="school" label="College" />}
            </View>
          )}

          {/* Physical stats (only if present in user profile) */}
          {(profile.height || profile.weight || profile.bodyType || profile.skinTone) && (
            <View style={styles.statsRow}>
              {profile.height ? <Stat text={`${profile.height} cm`} /> : null}
              {profile.weight ? <Stat text={`${profile.weight} kg`} /> : null}
              {profile.bodyType ? <Stat text={labelize(profile.bodyType)} /> : null}
              {profile.skinTone ? <Stat text={labelize(profile.skinTone)} /> : null}
            </View>
          )}

          {/* ABOUT ME section */}
          {(profile.aboutMe || profile.bio) && (
            <Section label="ABOUT ME">
              <View style={styles.aboutCard}>
                <Text style={styles.aboutText}>{profile.aboutMe ?? profile.bio}</Text>
              </View>
            </Section>
          )}
          {profile.aboutMe && profile.bio && profile.aboutMe !== profile.bio && (
            <Section label="BIO">
              <View style={styles.aboutCard}>
                <Text style={styles.aboutText}>{profile.bio}</Text>
              </View>
            </Section>
          )}

          {compatLoading || compatibility || compatLockedReason === 'plan_required' ? (
            <Section label="COMPATIBILITY">
              {compatLoading ? (
                <View style={styles.compatLoadingRow}>
                  <ActivityIndicator size="small" color="#F5C518" />
                  <Text style={styles.compatLoadingText}>
                    Calculating compatibility…
                  </Text>
                </View>
              ) : compatibility ? (
                <View style={styles.compatCard}>
                  <Text style={styles.compatScore}>{compatibility.score}%</Text>
                  {compatibility.breakdown.length > 0 ? (
                    <View style={styles.compatBreakdown}>
                      {compatibility.breakdown.map((line, i) => (
                        <View key={i} style={styles.compatBreakdownRow}>
                          <Ionicons name="checkmark-circle" size={16} color="#00D26A" />
                          <Text style={styles.compatBreakdownText}>{line}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : (
                <Pressable
                  style={styles.compatLockedCard}
                  onPress={() => setUpgradeOpen(true)}
                >
                  <Ionicons name="lock-closed" size={22} color="#8E8E93" />
                  <Text style={styles.compatLockedTitle}>See your compatibility</Text>
                  <Text style={styles.compatLockedSub}>Unlock with Platinum</Text>
                </Pressable>
              )}
            </Section>
          ) : null}

          {profile.whereAreYouFrom ? (
            <Section label="FROM">
              <Text style={styles.bodyText}>{profile.whereAreYouFrom}</Text>
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
                {profile.voiceClipUrl && (
                  <MediaPill
                    theme={theme}
                    icon="mic"
                    label="Voice intro"
                    onPress={() => setVoiceIntroExpanded((v) => !v)}
                  />
                )}
                {profile.videoClipUrl && (
                  <MediaPill
                    theme={theme}
                    icon="videocam"
                    label="Video intro"
                    onPress={() => setVideoIntroOpen(true)}
                  />
                )}
              </View>
              {voiceIntroExpanded && profile.voiceClipUrl ? (
                <View style={{ marginTop: 10 }}>
                  <AudioPlayer mediaUrl={profile.voiceClipUrl} isOwn={false} />
                </View>
              ) : null}
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
              {albums.every((a) => a.locked) ? (
                <View style={[styles.lockedAlbumCard, { backgroundColor: theme.backgroundTertiary }]}>
                  <Ionicons name="lock-closed" size={32} color={theme.textTertiary} />
                  <Text style={[styles.lockedAlbumTitle, { color: theme.textPrimary }]}>Albums locked</Text>
                  <Text style={[styles.lockedAlbumSub, { color: theme.textSecondary }]}>
                    Send a message to unlock
                  </Text>
                  <Pressable style={[styles.lockedAlbumBtn, { backgroundColor: theme.brand }]} onPress={openChat}>
                    <Text style={styles.lockedAlbumBtnText}>Send Message</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.albumGrid}>
                  {albums.map((a) => (
                    <Pressable
                      key={a.id}
                      style={[styles.albumTile, { backgroundColor: theme.backgroundTertiary }]}
                      onPress={() =>
                        a.locked
                          ? openChat()
                          : router.push({ pathname: '/albums/[id]', params: { id: a.id, title: a.title, ownerId: peerId } })
                      }
                    >
                      {a.locked ? (
                        <View style={[StyleSheet.absoluteFill, styles.noPhoto]}>
                          <Ionicons name="lock-closed" size={28} color={theme.textTertiary} />
                        </View>
                      ) : a.coverPhoto ? (
                        <RemoteImage source={{ uri: a.coverPhoto.url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
                      ) : (
                        <View style={[StyleSheet.absoluteFill, styles.noPhoto]}>
                          <Ionicons name="images" size={28} color={theme.textTertiary} />
                        </View>
                      )}
                      <View style={styles.albumShade} />
                      <View style={styles.albumMeta}>
                        <Text style={styles.albumName} numberOfLines={1}>{a.locked ? 'Locked' : a.title}</Text>
                        {!a.locked && (
                          <View style={styles.albumCount}>
                            <Ionicons name="images" size={11} color="#fff" />
                            <Text style={styles.albumCountText}>{a.photoCount}</Text>
                          </View>
                        )}
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </Section>
          ) : null}

          {/* ── In-chat contact extras (only when opened from a conversation) ── */}
          {fromChat && sharedImages.length > 0 ? (
            <>
              <View style={styles.sharedHead}>
                <Text style={[styles.sectionHeader, { color: theme.textTertiary, marginTop: 0 }]}>SHARED MEDIA</Text>
                <Pressable onPress={() => router.push({ pathname: '/chat/media', params: { id: fromChat, peerName: params.peerName ?? profile.firstName ?? '' } } as Href)}>
                  <Text style={[styles.seeAll, { color: theme.brand }]}>See All</Text>
                </Pressable>
              </View>
              <View style={styles.sharedStrip}>
                {sharedImages.slice(0, 3).map((img, i) => (
                  <Pressable key={`${img.uri}-${i}`} onPress={() => { setViewerIndex(i); setViewerOpen(true); }}>
                    <RemoteImage source={{ uri: img.uri }} style={[styles.sharedThumb, { backgroundColor: theme.surfaceElevated }]} contentFit="cover" />
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          {fromChat && sharedLinks.length > 0 ? (
            <>
              <View style={styles.sharedHead}>
                <Text style={[styles.sectionHeader, { color: theme.textTertiary, marginTop: 0 }]}>SHARED LINKS</Text>
                <Pressable onPress={() => router.push({ pathname: '/chat/media', params: { id: fromChat, peerName: params.peerName ?? profile.firstName ?? '', tab: 'links' } } as Href)}>
                  <Text style={[styles.seeAll, { color: theme.brand }]}>See All</Text>
                </Pressable>
              </View>
              {sharedLinks.slice(0, 2).map((l) => (
                <Pressable key={l.id} style={[styles.card, { backgroundColor: theme.surface, marginTop: 8 }]} onPress={() => Linking.openURL(l.url).catch(() => {})}>
                  <Text style={[styles.bodyText, { color: theme.brand, marginTop: 0 }]} numberOfLines={1}>{l.url}</Text>
                </Pressable>
              ))}
            </>
          ) : null}

          {fromChat && mutualGroups.length > 0 ? (
            <Section label="GROUPS IN COMMON">
              <View style={styles.chips}>
                {mutualGroups.map((g) => {
                  const meta = categoryMeta(theme, g.category);
                  return (
                    <Pressable
                      key={g.id}
                      style={[styles.chip, { backgroundColor: theme.surfaceElevated, flexDirection: 'row', alignItems: 'center', gap: 6 }]}
                      onPress={() => router.push({ pathname: '/rooms/[id]', params: { id: g.id } } as Href)}
                    >
                      <Ionicons name={meta.icon} size={14} color={meta.color} />
                      <Text style={[styles.chipText, { color: theme.textPrimary }]}>{g.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Section>
          ) : null}
        </View>
      </ScrollView>

      {/* Action bar */}
      <Animated.View style={[styles.barWrap, animatedBarStyle]}>
        <View
          style={{
            backgroundColor: '#000000',
            borderTopWidth: 1,
            borderTopColor: '#1C1C1E',
            paddingBottom: insets.bottom,
          }}
        >
          <View style={styles.bar}>
            <View style={styles.inputWrap}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Say something…"
                placeholderTextColor="#8E8E93"
                style={styles.input}
                multiline
                maxLength={1000}
                blurOnSubmit={false}
                textAlignVertical="center"
                scrollEnabled
              />
              {draft.trim().length > 0 && (
                <Pressable
                  onPress={sendInline}
                  disabled={sending}
                  hitSlop={8}
                  style={styles.sendBtn}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#F5C518" />
                  ) : (
                    <Ionicons name="arrow-up-circle" size={30} color="#F5C518" />
                  )}
                </Pressable>
              )}
            </View>
            <Pressable
              style={styles.bottomIconBtn}
              onPress={toggleTap}
            >
              <Ionicons name={liked ? 'flame' : 'flame-outline'} size={28} color="#F5C518" />
            </Pressable>
            <Pressable
              style={styles.bottomIconBtn}
              onPress={openChat}
            >
              <Ionicons name="chatbubble-outline" size={26} color="#F5C518" />
            </Pressable>
          </View>
        </View>
      </Animated.View>

      <MediaViewer
        visible={viewerOpen}
        images={sharedImages}
        initialIndex={viewerIndex}
        onClose={() => setViewerOpen(false)}
      />

      {/* Action menu */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={closeMenu}>
        <Pressable style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.75)' }]} onPress={closeMenu}>
          {blockConfirming ? (
            <Pressable style={[styles.menu, styles.confirmCard, { backgroundColor: '#1C1C1E' }]} onPress={() => {}}>
              <View style={[styles.confirmIconCircle, { backgroundColor: theme.error + '26' }]}>
                <Ionicons name="ban" size={28} color={theme.error} />
              </View>
              <Text style={[styles.confirmTitle, { color: '#FFFFFF' }]}>
                Block {profile?.firstName ?? 'this person'}?
              </Text>
              <Text style={[styles.confirmMessage, { color: '#8E8E93' }]}>
                They won’t be able to see you or message you. This is mutual.
              </Text>
              {blockError ? (
                <Text style={[styles.confirmError, { color: theme.error }]}>{blockError}</Text>
              ) : null}
              <View style={styles.confirmButtons}>
                <Pressable
                  style={[styles.confirmBtn, { backgroundColor: '#2C2C2E' }]}
                  onPress={closeMenu}
                  disabled={blocking}
                >
                  <Text style={[styles.confirmBtnText, { color: '#8E8E93' }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.confirmBtn, { backgroundColor: theme.error + '1A' }]}
                  onPress={doBlock}
                  disabled={blocking}
                >
                  {blocking ? (
                    <ActivityIndicator size="small" color={theme.error} />
                  ) : (
                    <Text style={[styles.confirmBtnText, { color: theme.error }]}>Block</Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          ) : (
            <View style={[styles.menu, { backgroundColor: '#1C1C1E' }]}>
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setMenuOpen(false);
                  setTimeout(() => setReportOpen(true), 300);
                }}
              >
                <Ionicons name="flag-outline" size={20} color="#FFFFFF" />
                <Text style={[styles.menuText, { color: '#FFFFFF' }]}>Report</Text>
              </Pressable>
              <Pressable style={styles.menuItem} onPress={confirmBlock}>
                <Ionicons name="ban-outline" size={20} color={theme.error} />
                <Text style={[styles.menuText, { color: theme.error }]}>Block</Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      </Modal>

      <ReportSheet visible={reportOpen} userId={peerId} onClose={() => setReportOpen(false)} />
      <UpgradeModal visible={upgradeOpen} onClose={() => setUpgradeOpen(false)} />

      {profile?.videoClipUrl ? (
        <MediaViewer
          visible={videoIntroOpen}
          images={
            [
              {
                uri: profile.videoClipUrl,
                senderId: peerId,
                senderName: profile.firstName ?? 'Someone',
                createdAt: new Date().toISOString(),
                kind: 'video',
              },
            ] as MediaViewerImage[]
          }
          initialIndex={0}
          onClose={() => setVideoIntroOpen(false)}
        />
      ) : null}
    </View>
  );
}

function Stat({ text }: { text: string }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statText}>{text}</Text>
    </View>
  );
}
function Badge({ icon, label }: { icon: any; label: string }) {
  return (
    <View style={styles.vBadge}>
      <Ionicons name={icon} size={13} color="#00D26A" />
      <Text style={styles.vBadgeText}>{label}</Text>
    </View>
  );
}
function MediaPill({
  theme,
  icon,
  label,
  onPress,
}: {
  theme: any;
  icon: any;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.mediaPill} onPress={onPress}>
      <Ionicons name={icon} size={18} color="#F5C518" />
      <Text style={styles.mediaText}>{label}</Text>
      <Ionicons name="play" size={14} color="#8E8E93" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  naTitle: { fontSize: FontSize.lg, fontFamily: DisplayFont.bold, fontWeight: '700' },
  naBtn: { marginTop: 8, height: 46, borderRadius: 999, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' },
  naBtnText: { fontSize: FontSize.md, fontFamily: DisplayFont.bold, fontWeight: '700' },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  heroTopScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 100 },
  heroDots: { position: 'absolute', bottom: 12, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  heroDotActive: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  heroDotInactive: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  heroBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  heroRight: { flexDirection: 'row', gap: 10 },
  circleBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  info: { paddingHorizontal: 16, paddingTop: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 26, fontFamily: DisplayFont.heavy, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  age: { fontFamily: DisplayFont.regular, fontWeight: '400', color: '#FFFFFF' },
  verifyTick: { marginLeft: 2 },
  planBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, flexWrap: 'wrap', gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  metaText: { fontSize: 14, fontFamily: FontFamily.medium, fontWeight: '600' },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  distText: { fontSize: 14, fontFamily: FontFamily.medium, color: '#8E8E93', fontWeight: '500' },
  availRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  availChip: { height: 28, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 4, alignItems: 'center', justifyContent: 'center' },
  availChipText: { fontSize: FontSize.sm, fontFamily: FontFamily.semibold },
  verifyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  vBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,210,106,0.12)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  vBadgeText: { fontSize: FontSize.sm, fontFamily: FontFamily.semibold, fontWeight: '600', color: '#00D26A' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  statPill: { backgroundColor: '#1C1C1E', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  statText: { fontSize: 13, fontFamily: FontFamily.semibold, fontWeight: '600', color: '#FFFFFF' },
  sectionWrap: { marginTop: 22, paddingHorizontal: 16 },
  sectionHeader: { fontSize: 12.5, fontFamily: DisplayFont.bold, fontWeight: '700', color: '#8E8E93', letterSpacing: 1.2, marginBottom: 10, textTransform: 'uppercase' },
  aboutCard: { backgroundColor: '#1C1C1E', borderRadius: 16, padding: 16 },
  aboutText: { fontSize: 15, fontFamily: FontFamily.regular, color: '#FFFFFF', lineHeight: 22, fontWeight: '400' },
  bodyText: { fontSize: 15, fontFamily: FontFamily.regular, color: '#EBEBF5', lineHeight: 22 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: '#1C1C1E', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 14, fontFamily: FontFamily.medium, color: '#FFFFFF', fontWeight: '500' },
  card: { backgroundColor: '#1C1C1E', borderRadius: 16, padding: 16, marginTop: 8 },
  compatLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  compatLoadingText: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: '#8E8E93' },
  compatCard: { backgroundColor: '#1C1C1E', borderRadius: 16, padding: 16, marginTop: 8, alignItems: 'center' },
  compatScore: { fontSize: FontSize.hero, fontFamily: DisplayFont.heavy, fontWeight: '800', color: '#F5C518' },
  compatBreakdown: { marginTop: 10, gap: 8, width: '100%' },
  compatBreakdownRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  compatBreakdownText: { flex: 1, fontSize: FontSize.md, fontFamily: FontFamily.regular, lineHeight: 20, color: '#FFFFFF' },
  compatLockedCard: { backgroundColor: '#1C1C1E', marginTop: 8, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingVertical: 20, gap: 4 },
  compatLockedTitle: { fontSize: FontSize.md, fontFamily: DisplayFont.bold, fontWeight: '700', marginTop: 4, color: '#FFFFFF' },
  compatLockedSub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: '#8E8E93' },
  sharedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, paddingHorizontal: 16 },
  seeAll: { fontSize: FontSize.sm, fontFamily: FontFamily.semibold, fontWeight: '600', color: '#F5C518' },
  sharedStrip: { flexDirection: 'row', gap: 8, marginTop: 10, paddingHorizontal: 16 },
  sharedThumb: { width: 80, height: 80, borderRadius: 12 },
  promptQ: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: '#8E8E93' },
  promptA: { fontSize: FontSize.lg, fontFamily: DisplayFont.semibold, fontWeight: '600', marginTop: 4, color: '#FFFFFF' },
  mediaPill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1C1C1E', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, marginTop: 8 },
  mediaText: { fontSize: FontSize.md, fontFamily: FontFamily.semibold, fontWeight: '600', color: '#FFFFFF' },
  barWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#1C1C1E',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 6 : 4,
    minHeight: 44,
    maxHeight: 120,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: FontFamily.regular,
    color: '#FFFFFF',
    minHeight: 32,
    maxHeight: 108,
    paddingTop: Platform.OS === 'ios' ? 6 : 4,
    paddingBottom: Platform.OS === 'ios' ? 6 : 4,
    textAlignVertical: 'center',
  },
  sendBtn: {
    marginLeft: 6,
    marginBottom: Platform.OS === 'ios' ? 4 : 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  lockedAlbumCard: { marginTop: 10, borderRadius: 16, backgroundColor: '#1C1C1E', alignItems: 'center', justifyContent: 'center', paddingVertical: 28, gap: 6 },
  lockedAlbumTitle: { fontSize: FontSize.md, fontFamily: DisplayFont.bold, fontWeight: '700', color: '#FFFFFF' },
  lockedAlbumSub: { fontSize: FontSize.sm, fontFamily: FontFamily.regular, color: '#8E8E93' },
  lockedAlbumBtn: { marginTop: 10, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: '#F5C518' },
  lockedAlbumBtnText: { color: '#000', fontSize: FontSize.sm, fontFamily: FontFamily.semibold, fontWeight: '700' },
  albumTile: { width: '31.5%', aspectRatio: 1, borderRadius: 14, overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: '#1C1C1E' },
  albumShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%', backgroundColor: 'rgba(0,0,0,0.5)' },
  albumMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 6 },
  albumName: { color: '#fff', fontSize: FontSize.sm, fontFamily: DisplayFont.bold, fontWeight: '700', flex: 1, textShadowColor: '#000', textShadowRadius: 3 },
  albumCount: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  albumCountText: { color: '#fff', fontSize: FontSize.xs, fontFamily: FontFamily.bold, fontWeight: '700' },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  menu: { width: '100%', borderRadius: 16, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  menuText: { fontSize: FontSize.lg, fontFamily: FontFamily.semibold, fontWeight: '600' },
  confirmCard: { alignItems: 'center', padding: 24 },
  confirmIconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  confirmTitle: { fontSize: FontSize.lg, fontFamily: DisplayFont.bold, textAlign: 'center', marginTop: 12 },
  confirmMessage: { fontSize: FontSize.md, fontFamily: FontFamily.regular, textAlign: 'center', marginTop: 8 },
  confirmError: { fontSize: FontSize.sm, fontFamily: FontFamily.medium, textAlign: 'center', marginTop: 8 },
  confirmButtons: { flexDirection: 'row', width: '100%', gap: 8, marginTop: 20 },
  confirmBtn: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  confirmBtnText: { fontSize: FontSize.md, fontFamily: FontFamily.semibold },
});
