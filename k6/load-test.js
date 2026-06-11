import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  stages: [
    { duration: '2m', target: 500 },
    { duration: '5m', target: 500 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed:   ['rate<0.005'],
  },
}

export default function () {
  const phone = `+9198${String(Math.floor(10000000 + Math.random() * 89999999))}`
  const base  = __ENV.BASE_URL || 'http://localhost:4000'

  // 1. Request OTP
  let r = http.post(
    `${base}/api/v1/auth/request-otp`,
    JSON.stringify({ phone }),
    { headers: { 'Content-Type': 'application/json' } }
  )
  check(r, { 'otp requested': (r) => r.status === 200 })

  // 2. Verify OTP (dev mode returns devCode)
  const body = r.json()
  const devCode = (body && body.devCode) ? body.devCode : '123456'
  r = http.post(
    `${base}/api/v1/auth/verify-otp`,
    JSON.stringify({ phone, code: devCode }),
    { headers: { 'Content-Type': 'application/json' } }
  )
  check(r, { 'authenticated': (r) => r.status === 200 })

  const authBody = r.json()
  const token = authBody && authBody.accessToken ? authBody.accessToken : ''
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }

  if (!token) {
    sleep(1)
    return
  }

  // 3. Update location
  r = http.post(
    `${base}/api/v1/me/location`,
    JSON.stringify({ lat: 12.9716 + Math.random() * 0.1, lng: 77.5946 + Math.random() * 0.1 }),
    { headers }
  )
  check(r, { 'location updated': (r) => r.status === 200 })

  // 4. Browse grid
  r = http.get(`${base}/api/v1/grid?lat=12.9716&lng=77.5946&limit=20`, { headers })
  check(r, { 'grid loaded': (r) => r.status === 200 })

  const gridBody = r.json()
  const cards = (gridBody && gridBody.cards) ? gridBody.cards : []

  if (cards.length > 0) {
    const targetId = cards[0].id

    // 5. Start conversation
    r = http.post(
      `${base}/api/v1/conversations/start`,
      JSON.stringify({ userId: targetId }),
      { headers }
    )
    check(r, { 'chat started': (r) => [200, 201, 403].includes(r.status) })

    const convBody = r.json()
    const convId = convBody && convBody.id ? convBody.id : null

    if (convId) {
      // 6. Send message
      r = http.post(
        `${base}/api/v1/conversations/${convId}/messages`,
        JSON.stringify({ type: 'text', content: 'Hey there!' }),
        { headers }
      )
      check(r, { 'message sent': (r) => [201, 451].includes(r.status) })
    }
  }

  // 7. Check health
  r = http.get(`${base}/health/ready`)
  check(r, { 'health ready': (r) => r.status === 200 })

  sleep(1)
}
