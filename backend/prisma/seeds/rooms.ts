/**
 * Seed official Dating Rooms that exist on app launch.
 *
 * Idempotent: a room is inserted only if one with the same (name) does not
 * already exist. Safe to run repeatedly.
 *
 * Run:  npm run seed:rooms
 */
import { PrismaClient, RoomCategory } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

interface RoomSeed {
  name: string;
  category: RoomCategory;
  city?: string;
  state?: string;
  isOfficial?: boolean;
  description?: string;
}

const ROOMS: RoomSeed[] = [
  // ── City Dating Rooms ──
  { name: 'Chennai Dating ❤️', category: 'city_dating', city: 'Chennai', state: 'Tamil Nadu', isOfficial: true },
  { name: 'Bangalore Dating ❤️', category: 'city_dating', city: 'Bangalore', state: 'Karnataka', isOfficial: true },
  { name: 'Hyderabad Dating ❤️', category: 'city_dating', city: 'Hyderabad', state: 'Telangana', isOfficial: true },
  { name: 'Mumbai Dating ❤️', category: 'city_dating', city: 'Mumbai', state: 'Maharashtra', isOfficial: true },
  { name: 'Delhi Dating ❤️', category: 'city_dating', city: 'Delhi', state: 'Delhi', isOfficial: true },
  { name: 'Pune Dating', category: 'city_dating', city: 'Pune', state: 'Maharashtra', isOfficial: true },
  { name: 'Kolkata Dating', category: 'city_dating', city: 'Kolkata', state: 'West Bengal', isOfficial: true },

  // ── Orientation Rooms ──
  { name: 'LGBTQ+ India 🏳️‍🌈', category: 'orientation', isOfficial: true },
  { name: 'Gay Dating India', category: 'orientation', isOfficial: true },
  { name: 'Lesbian Community India', category: 'orientation', isOfficial: true },
  { name: 'Bi & Pan India', category: 'orientation', isOfficial: true },

  // ── Age Group Rooms ──
  { name: '18–25 Dating', category: 'age_group', isOfficial: true },
  { name: '25–35 Dating', category: 'age_group', isOfficial: true },
  { name: '35+ Dating', category: 'age_group', isOfficial: true },

  // ── Intent Rooms ──
  { name: 'Serious Relationships 💑', category: 'relationship_intent', isOfficial: true },
  { name: 'Friends First 🤝', category: 'relationship_intent', isOfficial: true },
  { name: 'Casual Dating', category: 'relationship_intent', isOfficial: true },
  { name: 'Marriage Minded 💍', category: 'relationship_intent', isOfficial: true },

  // ── Local Meetup Rooms ──
  { name: 'Coffee Meetups ☕', category: 'local_meetups', isOfficial: true },
  { name: 'Movie Tonight 🎬', category: 'local_meetups', isOfficial: true },
  { name: 'Weekend Plans 🗓️', category: 'local_meetups', isOfficial: true },
];

async function main() {
  let created = 0;
  let skipped = 0;

  for (const room of ROOMS) {
    const existing = await prisma.room.findFirst({ where: { name: room.name } });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.room.create({
      data: {
        name: room.name,
        category: room.category,
        city: room.city ?? null,
        state: room.state ?? null,
        isOfficial: room.isOfficial ?? false,
        description: room.description ?? null,
      },
    });
    created++;
  }

  // eslint-disable-next-line no-console
  console.log(`[seed:rooms] created=${created} skipped=${skipped} total=${ROOMS.length}`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[seed:rooms] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
