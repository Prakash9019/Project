/**
 * Demo seed data — 8 personas around Mumbai for local feature testing.
 *
 * Run:  npm run db:seed
 * Login (dev only): POST /api/v1/auth/dev-login  { "email": "demo-you-male@nearme.dev" }
 */
import { PrismaClient, Plan, Gender, BodyType, WantToSee, DatingIntention } from '@prisma/client';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: 1,
  connectTimeout: 3000,
  lazyConnect: true,
});
redis.on('error', () => { /* handled per-call */ });

async function redisGeoAdd(userId: string, lng: number, lat: number) {
  try {
    await redis.geoadd('geo:users', lng, lat, userId);
  } catch {
    /* grid index optional if Redis is down during seed */
  }
}

async function redisGeoRemove(userId: string) {
  try {
    await redis.zrem('geo:users', userId);
  } catch {
    /* ignore */
  }
}

// ── Fixed IDs (stable across re-seeds) ───────────────────
const IDS = {
  youMale:    '11111111-1111-4111-8111-111111111101',
  youFemale:  '11111111-1111-4111-8111-111111111102',
  arjun:      '22222222-2222-4222-8222-222222222201',
  priya:      '33333333-3333-4333-8333-333333333301',
  rohan:      '44444444-4444-4444-8444-444444444401',
  meera:      '55555555-5555-4555-8555-555555555501',
  vikram:     '66666666-6666-4666-8666-666666666601',
  ananya:     '77777777-7777-4777-8777-777777777701',
} as const;

const BASE_LAT = 19.076;
const BASE_LNG = 72.8777;
const PLAN_EXPIRES = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

function photo(seed: string, w = 400, h = 600) {
  return `https://picsum.photos/seed/${seed}/${w}/${h}`;
}

function loc(offsetLat: number, offsetLng: number) {
  return { lat: BASE_LAT + offsetLat, lng: BASE_LNG + offsetLng };
}

type Persona = {
  id: string;
  email: string;
  firstName: string;
  name: string;
  gender: Gender;
  age: number;
  plan: Plan;
  bio: string;
  aboutMe: string;
  height: number;
  weight: number;
  bodyType: BodyType;
  wantToSee: WantToSee[];
  whoCanDiscoverMe: WantToSee[];
  datingIntentions: DatingIntention[];
  lookingFor: string[];
  interests: string[];
  tribes: string[];
  tags: string[];
  topArtists: string[];
  location: { lat: number; lng: number };
  photoSeeds: string[];
  verified: boolean;
  photoVerified: boolean;
  faceVerified: boolean;
  isCollegeVerified?: boolean;
  verifiedBadge?: boolean;
  incognitoMode?: boolean;
  historicalReplyRate?: number;
  isPrimary?: boolean;
};

const PERSONAS: Persona[] = [
  {
    id: IDS.youMale,
    email: 'demo-you-male@nearme.dev',
    firstName: 'Rahul',
    name: 'Rahul Sharma',
    gender: 'male',
    age: 29,
    plan: 'gold',
    bio: 'Coffee, cricket, and weekend hikes. Gold member testing inbox, calls, and who-viewed-me.',
    aboutMe: 'Product designer in Bandra. Looking for genuine connections nearby.',
    height: 178,
    weight: 74,
    bodyType: 'athletic',
    wantToSee: ['women'],
    whoCanDiscoverMe: ['women'],
    datingIntentions: ['casual_dates', 'life_partner'],
    lookingFor: ['casual', 'long_term'],
    interests: ['hiking', 'cricket', 'coffee', 'travel'],
    tribes: ['professional', 'fitness'],
    tags: ['dog-lover', 'foodie', 'night-owl'],
    topArtists: ['AR Rahman', 'The Weeknd', 'Prateek Kuhad'],
    location: loc(0, 0),
    photoSeeds: ['rahul1', 'rahul2', 'rahul3'],
    verified: true,
    photoVerified: true,
    faceVerified: true,
    verifiedBadge: true,
    historicalReplyRate: 0.82,
    isPrimary: true,
  },
  {
    id: IDS.youFemale,
    email: 'demo-you-female@nearme.dev',
    firstName: 'Kavya',
    name: 'Kavya Nair',
    gender: 'female',
    age: 27,
    plan: 'platinum',
    bio: 'Platinum tester — AI features, travel mode, unlimited albums. Art lover & foodie.',
    aboutMe: 'Marketing lead. Love exploring new restaurants and indie films.',
    height: 165,
    weight: 58,
    bodyType: 'slim',
    wantToSee: ['men'],
    whoCanDiscoverMe: ['men'],
    datingIntentions: ['casual_dates', 'ethical_non_monogamy'],
    lookingFor: ['casual', 'friendship'],
    interests: ['art', 'food', 'yoga', 'cinema'],
    tribes: ['creative', 'wellness'],
    tags: ['brunch', 'museums', 'beach'],
    topArtists: ['Billie Eilish', 'Shreya Ghoshal', 'FKJ'],
    location: loc(0.003, 0.002),
    photoSeeds: ['kavya1', 'kavya2', 'kavya3', 'kavya4'],
    verified: true,
    photoVerified: true,
    faceVerified: true,
    verifiedBadge: true,
    isCollegeVerified: true,
    historicalReplyRate: 0.91,
    isPrimary: true,
  },
  {
    id: IDS.arjun,
    email: 'arjun@nearme.dev',
    firstName: 'Arjun',
    name: 'Arjun Mehta',
    gender: 'male',
    age: 26,
    plan: 'free',
    bio: 'Startup founder. Free tier — testing the 20-interaction cap.',
    aboutMe: 'Building in Andheri. Always up for street food runs.',
    height: 175,
    weight: 70,
    bodyType: 'average',
    wantToSee: ['women'],
    whoCanDiscoverMe: ['women', 'everyone'],
    datingIntentions: ['casual_dates', 'intimacy_no_commitment'],
    lookingFor: ['one_night', 'casual'],
    interests: ['startups', 'street-food', 'gaming'],
    tribes: ['tech', 'foodie'],
    tags: ['chai', 'startups', 'late-night'],
    topArtists: ['Divine', 'Seedhe Maut'],
    location: loc(0.008, -0.004),
    photoSeeds: ['arjun1', 'arjun2', 'arjun3'],
    verified: false,
    photoVerified: false,
    faceVerified: false,
    historicalReplyRate: 0.45,
  },
  {
    id: IDS.priya,
    email: 'priya@nearme.dev',
    firstName: 'Priya',
    name: 'Priya Desai',
    gender: 'female',
    age: 24,
    plan: 'premium',
    bio: 'Premium member. Yoga instructor & sunset chaser.',
    aboutMe: 'Teach vinyasa in Juhu. Looking for someone who can keep up on a morning run.',
    height: 162,
    weight: 55,
    bodyType: 'curvy',
    wantToSee: ['men'],
    whoCanDiscoverMe: ['men'],
    datingIntentions: ['casual_dates', 'intimacy_no_commitment'],
    lookingFor: ['casual', 'fwb'],
    interests: ['yoga', 'running', 'beach'],
    tribes: ['fitness', 'wellness'],
    tags: ['sunrise', 'smoothies', 'travel'],
    topArtists: ['Ritviz', 'Norah Jones'],
    location: loc(-0.005, 0.006),
    photoSeeds: ['priya1', 'priya2', 'priya3'],
    verified: true,
    photoVerified: true,
    faceVerified: true,
    verifiedBadge: true,
    historicalReplyRate: 0.78,
  },
  {
    id: IDS.rohan,
    email: 'rohan@nearme.dev',
    firstName: 'Rohan',
    name: 'Rohan Kapoor',
    gender: 'male',
    age: 31,
    plan: 'gold',
    bio: 'Gold + boosted. Finance by day, DJ by night.',
    aboutMe: 'Worli resident. Love live music and rooftop bars.',
    height: 182,
    weight: 80,
    bodyType: 'athletic',
    wantToSee: ['women'],
    whoCanDiscoverMe: ['women'],
    datingIntentions: ['life_partner', 'marriage'],
    lookingFor: ['long_term'],
    interests: ['music', 'finance', 'travel'],
    tribes: ['professional', 'nightlife'],
    tags: ['rooftops', 'whiskey', 'concerts'],
    topArtists: ['Daft Punk', 'Nucleya'],
    location: loc(0.012, 0.003),
    photoSeeds: ['rohan1', 'rohan2', 'rohan3'],
    verified: true,
    photoVerified: true,
    faceVerified: true,
    historicalReplyRate: 0.65,
  },
  {
    id: IDS.meera,
    email: 'meera@nearme.dev',
    firstName: 'Meera',
    name: 'Meera Iyer',
    gender: 'female',
    age: 28,
    plan: 'free',
    bio: 'Recently joined. Free tier, still filling out profile.',
    aboutMe: 'Teacher in Dadar. Bookworm and cat mom.',
    height: 160,
    weight: 52,
    bodyType: 'slim',
    wantToSee: ['men'],
    whoCanDiscoverMe: ['men'],
    datingIntentions: ['friendship', 'casual_dates'],
    lookingFor: ['friendship', 'casual'],
    interests: ['books', 'cats', 'baking'],
    tribes: ['creative'],
    tags: ['reading', 'tea', 'cats'],
    topArtists: ['Taylor Swift', 'Arijit Singh'],
    location: loc(-0.002, -0.008),
    photoSeeds: ['meera1', 'meera2'],
    verified: false,
    photoVerified: false,
    faceVerified: false,
    historicalReplyRate: 0.3,
  },
  {
    id: IDS.vikram,
    email: 'vikram@nearme.dev',
    firstName: 'Vikram',
    name: 'Vikram Singh',
    gender: 'male',
    age: 35,
    plan: 'platinum',
    bio: 'Platinum, incognito mode on. Architect & photographer.',
    aboutMe: 'Prefer slow conversations over small talk.',
    height: 180,
    weight: 78,
    bodyType: 'average',
    wantToSee: ['women'],
    whoCanDiscoverMe: ['women'],
    datingIntentions: ['life_partner', 'marriage'],
    lookingFor: ['long_term'],
    interests: ['architecture', 'photography', 'wine'],
    tribes: ['professional', 'creative'],
    tags: ['minimalist', 'film-camera', 'wine'],
    topArtists: ['Hans Zimmer', 'Indian Ocean'],
    location: loc(0.015, -0.006),
    photoSeeds: ['vikram1', 'vikram2', 'vikram3', 'vikram4'],
    verified: true,
    photoVerified: true,
    faceVerified: true,
    incognitoMode: true,
    historicalReplyRate: 0.88,
  },
  {
    id: IDS.ananya,
    email: 'ananya@nearme.dev',
    firstName: 'Ananya',
    name: 'Ananya Reddy',
    gender: 'female',
    age: 22,
    plan: 'premium',
    bio: 'Premium + college verified. Med student, dancer.',
    aboutMe: 'Final year at KEM. Bollywood dance on weekends.',
    height: 168,
    weight: 57,
    bodyType: 'athletic',
    wantToSee: ['men'],
    whoCanDiscoverMe: ['men', 'everyone'],
    datingIntentions: ['casual_dates', 'virtual_dating'],
    lookingFor: ['casual', 'friendship'],
    interests: ['medicine', 'dance', 'fitness'],
    tribes: ['fitness', 'student'],
    tags: ['dance', 'study-buddy', 'brunch'],
    topArtists: ['Dua Lipa', 'Badshah'],
    location: loc(-0.01, 0.01),
    photoSeeds: ['ananya1', 'ananya2', 'ananya3'],
    verified: true,
    photoVerified: true,
    faceVerified: true,
    isCollegeVerified: true,
    historicalReplyRate: 0.72,
  },
];

function stablePair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

async function clearSeedData() {
  const emails = PERSONAS.map((p) => p.email);
  const ids = PERSONAS.map((p) => p.id);

  await prisma.message.deleteMany({ where: { conversation: { OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] } } });
  await prisma.conversation.deleteMany({ where: { OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] } });
  await prisma.user.deleteMany({ where: { OR: [{ email: { in: emails } }, { id: { in: ids } }] } });

  for (const id of ids) {
    await redisGeoRemove(id);
  }
}

async function seedUser(p: Persona) {
  const tier = p.plan === 'free' ? 'free' : p.plan === 'premium' ? 'basic' : p.plan === 'gold' ? 'advanced' : 'vip';

  await prisma.user.create({
    data: {
      id: p.id,
      email: p.email,
      emailVerified: true,
      phoneVerified: true,
      firebaseUid: `seed-${p.id}`,
      firstName: p.firstName,
      name: p.name,
      gender: p.gender,
      age: p.age,
      plan: p.plan,
      planExpiresAt: p.plan === 'free' ? null : PLAN_EXPIRES,
      tier,
      bio: p.bio,
      aboutMe: p.aboutMe,
      height: p.height,
      weight: p.weight,
      bodyType: p.bodyType,
      wantToSee: p.wantToSee,
      whoCanDiscoverMe: p.whoCanDiscoverMe,
      datingIntentions: p.datingIntentions,
      lookingFor: p.lookingFor,
      interests: p.interests,
      tribes: p.tribes,
      tags: p.tags,
      topArtists: p.topArtists,
      locationLat: p.location.lat,
      locationLng: p.location.lng,
      locationUpdatedAt: new Date(),
      isVerified: p.verified,
      photoVerified: p.photoVerified,
      faceVerified: p.faceVerified,
      verifiedBadge: p.verifiedBadge ?? false,
      isCollegeVerified: p.isCollegeVerified ?? false,
      incognitoMode: p.incognitoMode ?? false,
      historicalReplyRate: p.historicalReplyRate ?? null,
      profileCompletenessScore: 0.85,
      isOnGrid: true,
      lastActiveAt: new Date(),
      whereAreYouFrom: 'Mumbai, India',
      relationshipStatus: 'single',
      relationshipType: 'single',
      settings: {
        create: {
          discoverable: !(p.incognitoMode ?? false),
          showDistance: true,
          verifiedOnly: false,
        },
      },
      wallet: { create: { balance: p.isPrimary ? 500 : p.plan === 'free' ? 0 : 100 } },
      photos: {
        create: p.photoSeeds.map((seed, i) => ({
          url: photo(seed),
          isPrimary: i === 0,
          isPrivate: false,
          isPublished: true,
          order: i,
        })),
      },
      prompts: {
        create: [
          { prompt: 'The way to win me over is', answer: p.interests[0] ?? 'good conversation', order: 0 },
          { prompt: 'My simple pleasures', answer: p.tags[0] ?? 'coffee', order: 1 },
        ],
      },
      subscription:
        p.plan === 'free'
          ? undefined
          : {
              create: {
                tier,
                active: true,
                expiresAt: PLAN_EXPIRES,
                plan: p.plan,
                billingCycle: 'monthly',
                priceInr: p.plan === 'premium' ? 499 : p.plan === 'gold' ? 999 : 1499,
                paymentProvider: 'seed',
              },
            },
    },
  });

  if (p.photoVerified) {
    await prisma.verification.create({
      data: {
        userId: p.id,
        type: 'photo',
        status: 'approved',
        mediaUrl: photo(`${p.firstName}-selfie`),
        score: 0.95,
        reviewedAt: new Date(),
      },
    });
  }
  if (p.faceVerified) {
    await prisma.verification.create({
      data: {
        userId: p.id,
        type: 'face',
        status: 'approved',
        mediaUrl: photo(`${p.firstName}-face`),
        score: 0.97,
        reviewedAt: new Date(),
      },
    });
  }

  await redisGeoAdd(p.id, p.location.lng, p.location.lat);
}

async function seedRelationships() {
  const [a, b] = stablePair(IDS.youMale, IDS.priya);
  const convoRahulPriya = await prisma.conversation.create({
    data: {
      userAId: a,
      userBId: b,
      initiatorId: IDS.youMale,
      state: 'active',
      aHasReplied: true,
      bHasReplied: true,
      lastMessageAt: new Date(Date.now() - 3600_000),
    },
  });
  await prisma.message.createMany({
    data: [
      { conversationId: convoRahulPriya.id, senderId: IDS.youMale, type: 'text', content: 'Hey Priya! Loved your yoga pics 🧘' },
      { conversationId: convoRahulPriya.id, senderId: IDS.priya, type: 'text', content: 'Thanks Rahul! Free this weekend for a beach run?' },
      { conversationId: convoRahulPriya.id, senderId: IDS.youMale, type: 'text', content: 'Saturday morning works. Juhu beach?' },
    ],
  });

  const [c, d] = stablePair(IDS.youMale, IDS.meera);
  await prisma.conversation.create({
    data: {
      userAId: c,
      userBId: d,
      initiatorId: IDS.youMale,
      state: 'pending',
      aHasReplied: c === IDS.youMale,
      bHasReplied: false,
      lastMessageAt: new Date(Date.now() - 7200_000),
      messages: {
        create: { senderId: IDS.youMale, type: 'text', content: 'Hi Meera — fellow book lover here 📚' },
      },
    },
  });

  const [e, f] = stablePair(IDS.youFemale, IDS.arjun);
  await prisma.conversation.create({
    data: {
      userAId: e,
      userBId: f,
      initiatorId: IDS.arjun,
      state: 'active',
      aHasReplied: true,
      bHasReplied: true,
      lastMessageAt: new Date(),
      messages: {
        create: [
          { senderId: IDS.arjun, type: 'text', content: 'Your art gallery recs are spot on!' },
          { senderId: IDS.youFemale, type: 'text', content: 'Ha, thanks! Have you been to the new exhibit in Kala Ghoda?' },
          { senderId: IDS.arjun, type: 'text', content: 'Not yet — want to check it out together?' },
        ],
      },
    },
  });

  const [g, h] = stablePair(IDS.youFemale, IDS.rohan);
  await prisma.conversation.create({
    data: {
      userAId: g,
      userBId: h,
      initiatorId: IDS.rohan,
      state: 'active',
      aHasReplied: true,
      bHasReplied: true,
      aArchivedAt: g === IDS.youFemale ? new Date() : null,
      lastMessageAt: new Date(Date.now() - 86400_000 * 3),
      messages: {
        create: [
          { senderId: IDS.rohan, type: 'text', content: 'Caught your profile at the rooftop event last week' },
          { senderId: IDS.youFemale, type: 'text', content: 'Oh nice! Which one?' },
        ],
      },
    },
  });

  await prisma.favorite.createMany({
    data: [
      { userId: IDS.priya, favoriteId: IDS.youMale },
      { userId: IDS.youMale, favoriteId: IDS.ananya },
      { userId: IDS.youFemale, favoriteId: IDS.vikram },
    ],
    skipDuplicates: true,
  });

  await prisma.tap.createMany({
    data: [
      { senderId: IDS.arjun, receiverId: IDS.youFemale },
      { senderId: IDS.ananya, receiverId: IDS.youMale },
      { senderId: IDS.rohan, receiverId: IDS.priya },
    ],
    skipDuplicates: true,
  });

  await prisma.profileView.createMany({
    data: [
      { viewerId: IDS.rohan, viewedId: IDS.youMale },
      { viewerId: IDS.meera, viewedId: IDS.youMale },
      { viewerId: IDS.vikram, viewedId: IDS.youFemale },
      { viewerId: IDS.youMale, viewedId: IDS.priya },
      { viewerId: IDS.youFemale, viewedId: IDS.arjun },
      { viewerId: IDS.priya, viewedId: IDS.ananya },
    ],
    skipDuplicates: true,
  });

  await prisma.block.create({
    data: { blockerId: IDS.vikram, blockedId: IDS.arjun },
  });

  const privateAlbum = await prisma.privateAlbum.create({
    data: {
      ownerId: IDS.priya,
      name: 'Beach trips',
      photos: {
        create: [
          { userId: IDS.priya, url: photo('priya-private1'), isPrivate: true, order: 0 },
          { userId: IDS.priya, url: photo('priya-private2'), isPrivate: true, order: 1 },
        ],
      },
    },
    include: { photos: true },
  });
  await prisma.privateAlbumGrant.create({
    data: { albumId: privateAlbum.id, granteeId: IDS.youMale },
  });

  const album = await prisma.album.create({
    data: {
      userId: IDS.youFemale,
      title: 'Travel',
      photos: {
        create: [
          { userId: IDS.youFemale, photoUrl: photo('kavya-travel1'), order: 0 },
          { userId: IDS.youFemale, photoUrl: photo('kavya-travel2'), order: 1 },
        ],
      },
    },
    include: { photos: true },
  });
  await prisma.album.update({
    where: { id: album.id },
    data: { coverPhotoId: album.photos[0].id },
  });

  await prisma.feedBoost.create({
    data: {
      userId: IDS.rohan,
      geohash: 'te7',
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });

  await prisma.messageTemplate.createMany({
    data: [
      { userId: IDS.youMale, content: 'Hey! Your profile caught my eye 👋', displayOrder: 0 },
      { userId: IDS.youMale, content: 'Free for coffee this week?', displayOrder: 1 },
      { userId: IDS.youFemale, content: 'Love your vibe — want to chat?', displayOrder: 0 },
    ],
  });

  await prisma.savedPhrase.create({
    data: { userId: IDS.youMale, text: 'What are you up to this weekend?', order: 0 },
  });

  await prisma.addOnPurchase.create({
    data: {
      userId: IDS.rohan,
      addOnType: 'boost_local',
      priceInr: 199,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      paymentProvider: 'seed',
    },
  });

  await prisma.userInteraction.createMany({
    data: [
      { actorId: IDS.youMale, targetId: IDS.priya, interactionType: 'message' },
      { actorId: IDS.youMale, targetId: IDS.meera, interactionType: 'message' },
      { actorId: IDS.arjun, targetId: IDS.youFemale, interactionType: 'message' },
    ],
    skipDuplicates: true,
  });

  const rnExpires = (hours: number) => new Date(Date.now() + hours * 3600_000);
  const rnJoined = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000);

  await prisma.user.updateMany({
    where: { id: { in: [IDS.priya, IDS.rohan, IDS.ananya, IDS.meera, IDS.arjun] } },
    data: { rightNowStatus: null, rightNowCategory: null, rightNowExpiresAt: null },
  });

  await prisma.user.update({
    where: { id: IDS.priya },
    data: {
      rightNowStatus: 'Looking for coffee near Bandra ☕',
      rightNowCategory: 'coffee',
      rightNowExpiresAt: rnExpires(2),
      updatedAt: rnJoined(15),
    },
  });
  await prisma.user.update({
    where: { id: IDS.rohan },
    data: {
      rightNowStatus: 'Hosting drinks tonight — rooftop vibes',
      rightNowCategory: 'drinks',
      rightNowExpiresAt: rnExpires(4),
      updatedAt: rnJoined(41),
    },
  });
  await prisma.user.update({
    where: { id: IDS.ananya },
    data: {
      rightNowStatus: 'Hello 👋 free to meet right now',
      rightNowCategory: 'hangout',
      rightNowExpiresAt: rnExpires(1),
      updatedAt: rnJoined(8),
    },
  });
  await prisma.user.update({
    where: { id: IDS.meera },
    data: {
      rightNowStatus: 'Bookstore hop + chai?',
      rightNowCategory: 'coffee',
      rightNowExpiresAt: rnExpires(3),
      updatedAt: rnJoined(22),
    },
  });
  await prisma.user.update({
    where: { id: IDS.arjun },
    data: {
      rightNowStatus: 'Gym session — join for a workout',
      rightNowCategory: 'workout',
      rightNowExpiresAt: rnExpires(2),
      updatedAt: rnJoined(55),
    },
  });
}

async function main() {
  console.log('🌱 Seeding demo data…');

  let redisOk = false;
  try {
    await redis.connect();
    await redis.ping();
    redisOk = true;
  } catch {
    console.warn('⚠️  Redis unavailable — profiles will seed but grid geo index will be empty until Redis is up.');
  }

  await clearSeedData();

  for (const p of PERSONAS) {
    await seedUser(p);
    console.log(`  ✓ ${p.firstName} (${p.plan}, ${p.gender})`);
  }

  await seedRelationships();
  console.log('  ✓ conversations, taps, views, favorites, albums, right-now');

  console.log('\n✅ Seed complete!\n');
  console.log('── Log in (app or API) — all @nearme.dev accounts ──');
  console.log('  Password: NearMeDemo1!  (override via DEV_SEED_PASSWORD in backend/.env)');
  console.log('\n  demo-you-male@nearme.dev    → Rahul (Gold, male)');
  console.log('  demo-you-female@nearme.dev  → Kavya (Platinum, female)');
  console.log('  arjun@nearme.dev            → Arjun (Free, male)');
  console.log('  priya@nearme.dev            → Priya (Premium, female)');
  console.log('  rohan@nearme.dev            → Rohan (Gold, male)');
  console.log('  meera@nearme.dev            → Meera (Free, female)');
  console.log('  vikram@nearme.dev           → Vikram (Platinum, male)');
  console.log('  ananya@nearme.dev           → Ananya (Premium, female)');
  console.log('\n── Grid location (use in app or API) ──');
  console.log(`  lat=${BASE_LAT}  lng=${BASE_LNG}  (Mumbai — all 8 profiles within ~2 km)`);
  if (!redisOk) {
    console.log('\n⚠️  Re-run seed after starting Redis, or POST /api/v1/me/location from each user to populate the grid index.');
  }
  console.log('\n  Seeded profiles are pre-verified — no AWS/Firebase verification needed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    redis.disconnect();
  });
