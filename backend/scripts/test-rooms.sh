#!/usr/bin/env bash
# Smoke test for the Dating Rooms API.
# Usage: bash scripts/test-rooms.sh
set -o pipefail

BASE="${BASE:-http://localhost:4000}"
EMAIL="${EMAIL:-demo-you-male@nearme.dev}"
PASS="${PASS:-NearMe_2026!}"

PASS_CNT=0
FAIL_CNT=0
ok()   { echo "  ✅ $1"; PASS_CNT=$((PASS_CNT+1)); }
bad()  { echo "  ❌ $1"; FAIL_CNT=$((FAIL_CNT+1)); }

j() { jq -r "$1" 2>/dev/null; }

echo "── Test 1: Auth (dev-login) ──"
LOGIN=$(curl -s -X POST "$BASE/api/v1/auth/dev-login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
TOKEN=$(echo "$LOGIN" | j '.accessToken')
[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] && ok "got accessToken" || { bad "no token: $LOGIN"; exit 1; }
AUTH=(-H "Authorization: Bearer $TOKEN")

echo "── Test 2: Discover rooms ──"
ROOMS=$(curl -s "${AUTH[@]}" "$BASE/api/rooms?limit=50")
CNT=$(echo "$ROOMS" | j '.rooms | length')
[ "$CNT" = "21" ] && ok "21 rooms returned" || bad "expected 21 rooms, got $CNT"
FIRST=$(echo "$ROOMS" | j '.rooms[0]')
for f in id name category memberCount isOfficial isJoined; do
  [ "$(echo "$FIRST" | j ".$f")" != "null" ] && ok "room has $f" || bad "room missing $f"
done
RID=$(echo "$ROOMS" | j '.rooms[0].id')
# Ensure a clean baseline (idempotent re-runs): leave if already joined.
curl -s "${AUTH[@]}" -X DELETE "$BASE/api/rooms/$RID/join" >/dev/null
MC_BEFORE=$(curl -s "${AUTH[@]}" "$BASE/api/rooms/$RID" | j '.room.memberCount')
echo "  (using room $RID, baseline memberCount=$MC_BEFORE)"

echo "── Test 3: Join room ──"
JOIN=$(curl -s "${AUTH[@]}" -X POST "$BASE/api/rooms/$RID/join")
[ "$(echo "$JOIN" | j '.ok')" = "true" ] && ok "join ok:true" || bad "join failed: $JOIN"
MC_AFTER=$(echo "$JOIN" | j '.room.memberCount')
if [ "${MC_AFTER:-0}" -gt "${MC_BEFORE:-0}" ] 2>/dev/null; then
  ok "memberCount incremented (${MC_BEFORE} to ${MC_AFTER})"
else
  bad "memberCount not incremented (${MC_BEFORE} to ${MC_AFTER})"
fi

echo "── Test 4: Messages (may be non-empty if re-run) ──"
MSGS=$(curl -s "${AUTH[@]}" "$BASE/api/rooms/$RID/messages")
echo "$MSGS" | j '.messages' >/dev/null && ok "messages endpoint returns list (hasMore=$(echo "$MSGS" | j '.hasMore'))" || bad "messages failed: $MSGS"

echo "── Test 5: Send message ──"
SEND=$(curl -s "${AUTH[@]}" -X POST "$BASE/api/rooms/$RID/messages" -H 'Content-Type: application/json' \
  -d '{"content":"Hello from test","type":"text"}')
MID=$(echo "$SEND" | j '.id')
[ -n "$MID" ] && [ "$MID" != "null" ] && ok "message created id=$MID" || bad "send failed: $SEND"
for f in id roomId senderId content createdAt; do
  [ "$(echo "$SEND" | j ".$f")" != "null" ] && ok "message has $f" || bad "message missing $f"
done
[ "$(echo "$SEND" | j '.sender.firstName')" != "null" ] && ok "sender.firstName present" || bad "sender.firstName missing"
if echo "$SEND" | jq -e '.sender | has("phone") or has("email") or has("firebaseUid")' >/dev/null 2>&1; then
  bad "sender leaks phone/email/firebaseUid!"
else
  ok "sender has NO phone/email/firebaseUid"
fi

echo "── Test 6: Phone-number message (moderation) ──"
CODE=$(curl -s -o /tmp/mod.json -w '%{http_code}' "${AUTH[@]}" -X POST "$BASE/api/rooms/$RID/messages" \
  -H 'Content-Type: application/json' -d '{"content":"Call me on 9876543210"}')
if [ "$CODE" = "451" ]; then ok "phone number flagged (451)"; else bad "phone number NOT flagged (got $CODE): $(cat /tmp/mod.json)"; fi

echo "── Test 6b: External link message ──"
CODE=$(curl -s -o /tmp/mod2.json -w '%{http_code}' "${AUTH[@]}" -X POST "$BASE/api/rooms/$RID/messages" \
  -H 'Content-Type: application/json' -d '{"content":"check https://spam.example.com now"}')
if [ "$CODE" = "451" ]; then ok "external link flagged (451)"; else bad "external link NOT flagged (got $CODE): $(cat /tmp/mod2.json)"; fi

echo "── Test 7: React (add) ──"
R1=$(curl -s "${AUTH[@]}" -X POST "$BASE/api/rooms/$RID/messages/$MID/react" -H 'Content-Type: application/json' -d '{"emoji":"❤️"}')
[ "$(echo "$R1" | j '.added')" = "true" ] && [ "$(echo "$R1" | j '.count')" = "1" ] && ok "reaction added count=1" || bad "react add wrong: $R1"

echo "── Test 8: React (toggle off) ──"
R2=$(curl -s "${AUTH[@]}" -X POST "$BASE/api/rooms/$RID/messages/$MID/react" -H 'Content-Type: application/json' -d '{"emoji":"❤️"}')
[ "$(echo "$R2" | j '.added')" = "false" ] && [ "$(echo "$R2" | j '.count')" = "0" ] && ok "reaction removed count=0" || bad "react toggle wrong: $R2"

echo "── Test 9: Members ──"
MEM=$(curl -s "${AUTH[@]}" "$BASE/api/rooms/$RID/members")
echo "$MEM" | jq -e '.members | length >= 1' >/dev/null 2>&1 && ok "members list has >=1" || bad "members empty: $MEM"
U0=$(echo "$MEM" | j '.members[0].user')
for f in firstName isVerified distanceLabel; do
  echo "$U0" | jq -e "has(\"$f\")" >/dev/null 2>&1 && ok "member.user has $f" || bad "member.user missing $f"
done
if echo "$U0" | jq -e 'has("phone") or has("email") or has("firebaseUid") or has("locationLat")' >/dev/null 2>&1; then
  bad "member.user leaks phone/email/firebaseUid/locationLat!"
else
  ok "member.user has NO phone/email/firebaseUid/locationLat"
fi

echo "── Test 10: Joined rooms ──"
JR=$(curl -s "${AUTH[@]}" "$BASE/api/rooms/joined")
echo "$JR" | jq -e --arg r "$RID" '.rooms | map(.id) | index($r) != null' >/dev/null 2>&1 && ok "joined includes room" || bad "joined missing room: $JR"

echo "── Test 11: Leave room ──"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "${AUTH[@]}" -X DELETE "$BASE/api/rooms/$RID/join")
[ "$CODE" = "204" ] && ok "leave 204" || bad "leave got $CODE"
JR2=$(curl -s "${AUTH[@]}" "$BASE/api/rooms/joined")
echo "$JR2" | jq -e --arg r "$RID" '.rooms | map(.id) | index($r) == null' >/dev/null 2>&1 && ok "joined no longer includes room" || bad "room still in joined after leave"

echo "── Test 12: Mute toggle (rejoin first) ──"
curl -s "${AUTH[@]}" -X POST "$BASE/api/rooms/$RID/join" >/dev/null
M1=$(curl -s "${AUTH[@]}" -X POST "$BASE/api/rooms/$RID/mute")
[ "$(echo "$M1" | j '.muted')" = "true" ] && ok "muted:true" || bad "mute wrong: $M1"
M2=$(curl -s "${AUTH[@]}" -X POST "$BASE/api/rooms/$RID/mute")
[ "$(echo "$M2" | j '.muted')" = "false" ] && ok "muted:false" || bad "unmute wrong: $M2"

echo "── Test 13: Report room ──"
RP=$(curl -s "${AUTH[@]}" -X POST "$BASE/api/rooms/$RID/report" -H 'Content-Type: application/json' -d '{"reason":"spam","details":"test report"}')
[ "$(echo "$RP" | j '.ok')" = "true" ] && ok "report ok" || bad "report failed: $RP"

echo ""
echo "════════════════════════════════════"
echo "  PASSED: $PASS_CNT   FAILED: $FAIL_CNT"
echo "════════════════════════════════════"
[ "$FAIL_CNT" -eq 0 ]
