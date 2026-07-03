/**
 * Socket smoke test for Dating Rooms.
 * Connects two authenticated clients (A + B), joins the same room, and verifies
 * room:message, room:typing and room:message_reaction delivery.
 *
 * Run: node -r ts-node/register/transpile-only scripts/test-room-socket.ts
 * (uses socket.io-client from ../frontend/node_modules)
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { io } = require('../../frontend/node_modules/socket.io-client');

const BASE = process.env.BASE || 'http://localhost:4000';
const PASS = process.env.PASS || 'NearMe_2026!';
const EMAIL_A = 'demo-you-male@nearme.dev';
const EMAIL_B = 'demo-you-female@nearme.dev';

let passed = 0;
let failed = 0;
const ok = (m: string) => { console.log('  ✅ ' + m); passed++; };
const bad = (m: string) => { console.log('  ❌ ' + m); failed++; };

async function login(email: string): Promise<string> {
  const res = await fetch(`${BASE}/api/v1/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASS }),
  });
  const j = (await res.json()) as { accessToken: string };
  return j.accessToken;
}

async function api(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: res.status === 204 ? null : await res.json().catch(() => null) };
}

function connect(token: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (e: Error) => reject(e));
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}

const waitFor = (socket: any, event: string, ms = 4000): Promise<any> =>
  new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    socket.once(event, (p: unknown) => { clearTimeout(t); resolve(p); });
  });

async function main() {
  const [tokenA, tokenB] = await Promise.all([login(EMAIL_A), login(EMAIL_B)]);
  ok('both users logged in');

  // Pick a room and make sure both are members.
  const rooms = await api(tokenA, 'GET', '/api/rooms?limit=1');
  const roomId = rooms.json.rooms[0].id as string;
  await api(tokenA, 'POST', `/api/rooms/${roomId}/join`);
  await api(tokenB, 'POST', `/api/rooms/${roomId}/join`);
  ok(`both joined room ${roomId}`);

  const socketA = await connect(tokenA);
  const socketB = await connect(tokenB);
  ok('both sockets connected');

  socketA.emit('room:join', { roomId });
  socketB.emit('room:join', { roomId });
  await new Promise((r) => setTimeout(r, 400));

  // Test A: A sends via API → B receives room:message
  const msgP = waitFor(socketB, 'room:message');
  const sent = await api(tokenA, 'POST', `/api/rooms/${roomId}/messages`, { content: 'socket hello from A', type: 'text' });
  const msg = await msgP;
  if (msg && msg.id === sent.json.id) ok('B received room:message'); else bad('B did NOT receive room:message');
  if (msg && msg.sender && msg.sender.firstName && !('phone' in msg.sender) && !('email' in msg.sender)) {
    ok('room:message sender has firstName, no phone/email');
  } else {
    bad('room:message sender payload wrong: ' + JSON.stringify(msg && msg.sender));
  }

  // Test B: B emits room:typing → A receives it
  const typP = waitFor(socketA, 'room:typing');
  socketB.emit('room:typing', { roomId, isTyping: true });
  const typing = await typP;
  if (typing && typing.isTyping === true && typing.userId && 'firstName' in typing) {
    ok('A received room:typing { userId, firstName, isTyping }');
  } else {
    bad('A did NOT receive valid room:typing: ' + JSON.stringify(typing));
  }

  // Test C: A reacts via API → B receives room:message_reaction
  const reactP = waitFor(socketB, 'room:message_reaction');
  await api(tokenA, 'POST', `/api/rooms/${roomId}/messages/${sent.json.id}/react`, { emoji: '🔥' });
  const reaction = await reactP;
  if (reaction && reaction.messageId === sent.json.id && reaction.emoji === '🔥') {
    ok('B received room:message_reaction');
  } else {
    bad('B did NOT receive room:message_reaction: ' + JSON.stringify(reaction));
  }

  // cleanup reaction
  await api(tokenA, 'POST', `/api/rooms/${roomId}/messages/${sent.json.id}/react`, { emoji: '🔥' });

  socketA.close();
  socketB.close();

  console.log('\n════════════════════════════════════');
  console.log(`  SOCKET PASSED: ${passed}   FAILED: ${failed}`);
  console.log('════════════════════════════════════');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
