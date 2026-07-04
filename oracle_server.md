Since your backend is already deployed on the Oracle VM, redeploying after GitHub changes is straightforward.

## Step 1: SSH into your Oracle VM

```bash
ssh -i <your-private-key>.pem ubuntu@140.245.208.97
```

---

## Step 2: Go to your project

```bash
cd ~/Project
```

---

## Step 3: Pull the latest changes

First, check your branch:

```bash
git branch
```

If you're on `main`, then run:

```bash
git pull origin main
```

If you're on `master`, then:

```bash
git pull origin master
```

---

## Step 4: Go to the backend

```bash
cd backend
```

---

## Step 5: Rebuild and restart the container

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

This command will:

* ✅ Pull the latest code (already done in Step 3)
* ✅ Rebuild the Docker image
* ✅ Stop the old container
* ✅ Start the new container

---

## Step 6: Watch the logs

```bash
docker compose -f docker-compose.prod.yml logs -f
```

You should again see:

```text
Prisma schema loaded...
No pending migrations to apply.
[server] listening on :4000 (production)
```

---

## Step 7: Test the API

```bash
curl http://localhost:4000/health
```

Expected:

```json
{"status":"ok"}
```

Then test externally:

```bash
curl http://140.245.208.97:4000/health
```

---

# If you changed the Prisma schema

If your GitHub changes included:

* `prisma/schema.prisma`
* new migrations in `prisma/migrations`

then also run:

```bash
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

Although your current `docker-compose.prod.yml` already runs:

```bash
npx prisma migrate deploy && node dist/index.js
```

during startup, so in most cases you **don't need to run it manually**.

---

# One-command redeploy

From now on, whenever you push backend changes to GitHub, the redeploy process is simply:

```bash
cd ~/Project
git pull origin main
cd backend
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f
```

---

## If `git pull` says there are local changes

Run:

```bash
git status
```

before doing anything else and paste the output. I'll tell you whether to stash, reset, or resolve the changes.
