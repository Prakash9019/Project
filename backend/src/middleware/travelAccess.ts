import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';

/** Allows Gold/Platinum plans OR a Free/Premium user with an active travel-pass add-on. */
export async function requireTravelAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const plan = req.effectiveLimits?.plan;

  if (plan === 'gold' || plan === 'platinum') {
    next();
    return;
  }

  const userId = req.user?.sub;
  if (!userId) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const activePass = await prisma.addOnPurchase.findFirst({
    where: {
      userId,
      addOnType: { in: ['travel_pass', 'travel_pass_week'] },
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });

  if (activePass) {
    next();
    return;
  }

  res.status(403).json({
    error: 'plan_required',
    requiredPlan: 'gold',
    message: 'Travel mode requires Gold plan or a Travel Pass add-on.',
    canPurchase: true,
    addOnTypes: ['travel_pass', 'travel_pass_week'],
  });
}
