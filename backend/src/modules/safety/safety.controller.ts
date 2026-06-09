import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { Errors } from '../../utils/httpError';

export const blockSchema = z.object({ userId: z.string().uuid() });
export const reportSchema = z.object({
  userId: z.string().uuid(),
  reason: z.enum(['spam', 'harassment', 'fake_profile', 'inappropriate_content', 'other']),
  details: z.string().max(500).optional(),
});

export async function block(req: Request, res: Response): Promise<void> {
  const blockerId = req.user!.sub;
  const { userId: blockedId } = req.body as z.infer<typeof blockSchema>;
  if (blockerId === blockedId) throw Errors.badRequest('Cannot block yourself');

  await prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    update: {},
    create: { blockerId, blockedId },
  });
  res.status(201).json({ ok: true });
}

export async function unblock(req: Request, res: Response): Promise<void> {
  const blockerId = req.user!.sub;
  const { userId: blockedId } = req.params;
  await prisma.block.deleteMany({ where: { blockerId, blockedId } });
  res.status(204).send();
}

export async function listBlocks(req: Request, res: Response): Promise<void> {
  const blocks = await prisma.block.findMany({
    where: { blockerId: req.user!.sub },
    select: { blockedId: true, createdAt: true },
  });
  res.status(200).json({ blocked: blocks });
}

export async function report(req: Request, res: Response): Promise<void> {
  const reporterId = req.user!.sub;
  const { userId: reportedId, reason, details } = req.body as z.infer<typeof reportSchema>;
  if (reporterId === reportedId) throw Errors.badRequest('Cannot report yourself');

  await prisma.report.create({ data: { reporterId, reportedId, reason, details } });
  res.status(201).json({ ok: true });
}
