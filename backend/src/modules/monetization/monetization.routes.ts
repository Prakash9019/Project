import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { requireAuth, requireVerifiedPhone } from '../../middleware/auth';
import * as billing from './monetization.controller';
import * as subs from './subscriptions.controller';
import * as addons from './addons.controller';
import { BILLING_CATALOG } from './billingPlans';
import { redis, RedisKeys } from '../../config/redis';

const router = Router();

// ── Public ────────────────────────────────────────────────

// Static billing catalog — cached in Redis for 1 hour
router.get('/billing/plans', asyncHandler(async (_req, res) => {
  const cacheKey = RedisKeys.cacheBillingPlans;
  const cached = await redis.get(cacheKey);
  if (cached) {
    res.status(200).json(JSON.parse(cached));
    return;
  }
  await redis.set(cacheKey, JSON.stringify(BILLING_CATALOG), 'EX', 3600);
  res.status(200).json(BILLING_CATALOG);
}));
router.get('/addons', asyncHandler(addons.listAddons));

// Legacy plans endpoint (kept for backward compat)
router.get('/plans', asyncHandler(billing.plans));

// ── Authenticated ─────────────────────────────────────────
router.use(requireAuth, requireVerifiedPhone);

// Subscriptions
router.get('/subscriptions/current', asyncHandler(subs.currentSubscription));
router.post('/subscriptions', validate(subs.createSubscriptionSchema), asyncHandler(subs.createSubscription));
router.post('/subscriptions/verify', validate(subs.verifySubscriptionSchema), asyncHandler(subs.verifySubscription));
router.delete('/subscriptions/current', asyncHandler(subs.cancelSubscription));

// Add-ons
router.post('/addons/purchase', validate(addons.purchaseAddonSchema), asyncHandler(addons.purchaseAddon));
router.post('/addons/verify', validate(addons.verifyAddonSchema), asyncHandler(addons.verifyAddon));
router.get('/addons/active', asyncHandler(addons.activeAddons));

// Wallet / credits
router.get('/wallet', asyncHandler(billing.wallet));
router.post('/credits/purchase', validate(billing.purchaseCreditsSchema), asyncHandler(billing.purchaseCredits));

// Boosts (legacy thin delegates → internally create an AddOnPurchase via boost_local)
router.post('/boosts', validate(billing.boostSchema), asyncHandler(billing.createBoost));
router.get('/boosts/active', asyncHandler(billing.activeBoost));

// Verification (legacy)
router.post('/verify', validate(billing.verifySchema), asyncHandler(billing.verifyAccount));

export default router;
