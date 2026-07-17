# NearMe Backend Tests

## Setup (first time)
```bash
npm run test:db:setup   # start Docker containers + run migrations
npm test                # run all tests
```

## Running tests
```bash
npm test                # run once
npm run test:watch      # watch mode (re-runs on file change)
npm run test:coverage   # with coverage report
```

## Test database
Uses a local Docker Postgres (`nearme_test`, host port 5433) + Redis (host port
6380) — see `docker-compose.test.yml`. Both use `tmpfs`, so data is wiped when
the containers stop. This is separate from your development DB/Redis.

All data is wiped between tests via `cleanDatabase()` in `helpers.ts`.

## Adding new tests
- Create files in `src/tests/*.test.ts`.
- Use helpers from `src/tests/helpers.ts` (`createTestUser`, `createTestToken`,
  `createActiveAddOn`, `authHeader`, `cleanDatabase`).
- Call `cleanDatabase()` in `afterEach()`.
- Tests call `createApp()` from `../app` directly with supertest — no server
  needs to be listening.

## Priority levels
- Priority 1 (`revenue.test.ts`): Money-related — run before every deploy.
- Priority 2 (`safety.test.ts`): Safety rules — run before every deploy.
- Priority 3 (`core.test.ts`): Core mechanics — run in the full test suite.
