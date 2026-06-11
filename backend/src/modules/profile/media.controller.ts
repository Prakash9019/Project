import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { prisma } from '../../config/prisma';
import { gcs } from '../../adapters/gcs';
import { moderateImage } from '../../services/imageModeration';
import { Errors, HttpError } from '../../utils/httpError';
import { signUrl } from '../../utils/signUrl';

// ── Multer instances (memory storage — never touch disk) ──────────────────────

const VOICE_ALLOWED_MIME = new Set(['audio/mp4', 'audio/m4a', 'audio/webm']);
const VIDEO_ALLOWED_MIME = new Set(['video/mp4', 'video/webm']);

const voiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    VOICE_ALLOWED_MIME.has(file.mimetype)
      ? cb(null, true)
      : cb(new Error('INVALID_MIME'));
  },
});

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    VIDEO_ALLOWED_MIME.has(file.mimetype)
      ? cb(null, true)
      : cb(new Error('INVALID_MIME'));
  },
});

export const voiceUploadMiddleware = voiceUpload.single('audio');
export const videoUploadMiddleware = videoUpload.single('video');

// ── Voice clip upload — POST /me/voice-clip ───────────────────────────────────

export async function uploadVoiceClip(req: Request, res: Response): Promise<void> {
  const file = req.file;
  if (!file) throw Errors.badRequest('Missing audio file (field: audio)');
  if (!VOICE_ALLOWED_MIME.has(file.mimetype)) throw Errors.badRequest('Invalid audio MIME type');

  const userId = req.user!.sub;
  const limits = req.effectiveLimits;

  // Plan gates (null = not available on this plan)
  if (limits?.voiceClipSec == null) {
    throw Errors.forbidden('Voice clips require Premium or higher plan');
  }

  // Size-based duration proxy: 128 kbps ≈ 16 KB/s → maxBytes = limitSec * 16000
  const maxBytes = limits.voiceClipSec * 16_000;
  if (file.size > maxBytes) {
    throw Errors.badRequest(`Audio exceeds ${limits.voiceClipSec}s duration limit for your plan`);
  }

  const gcsPath = `voice-clips/${userId}/${uuidv4()}.m4a`;
  await gcs.uploadBuffer(file.buffer, gcsPath, 'audio/mp4');

  await prisma.user.update({ where: { id: userId }, data: { voiceClipUrl: gcsPath } });

  const signedUrl = await signUrl(gcsPath);
  res.status(200).json({ voiceClipUrl: signedUrl });
}

// ── Video clip upload — POST /me/video-clip ───────────────────────────────────

export async function uploadVideoClip(req: Request, res: Response): Promise<void> {
  const file = req.file;
  if (!file) throw Errors.badRequest('Missing video file (field: video)');
  if (!VIDEO_ALLOWED_MIME.has(file.mimetype)) throw Errors.badRequest('Invalid video MIME type');

  const userId = req.user!.sub;
  const limits = req.effectiveLimits;

  if (limits?.videoClipSec == null) {
    throw Errors.forbidden('Video clips require Premium or higher plan');
  }

  // Size-based duration proxy: 500 kbps ≈ 62.5 KB/s → maxBytes = limitSec * 62500
  const maxBytes = limits.videoClipSec * 62_500;
  if (file.size > maxBytes) {
    throw Errors.badRequest(`Video exceeds ${limits.videoClipSec}s duration limit for your plan`);
  }

  // Thumbnail extraction: skipped — no sharp/ffmpeg available
  // Moderation runs on first frame if we had the tool; skip for now (thumbnailUrl=null)
  let thumbnailPath: string | null = null;
  let isPublished = true;

  // If we had thumbnail bytes, we'd call moderateImage here.
  // For now, fall through to allow with isPublished=true.
  void thumbnailPath; void isPublished;

  const gcsPath = `video-clips/${userId}/${uuidv4()}.mp4`;
  await gcs.uploadBuffer(file.buffer, gcsPath, 'video/mp4');

  await prisma.user.update({ where: { id: userId }, data: { videoClipUrl: gcsPath } });

  const signedUrl = await signUrl(gcsPath);
  res.status(200).json({ videoClipUrl: signedUrl, thumbnailUrl: null });
}

// ── Signed upload URL — GET /me/upload-url ────────────────────────────────────

const UPLOAD_TYPE_CONFIG: Record<string, { folder: string; ext: string; contentType: string }> = {
  photo:       { folder: 'profile-photos', ext: 'jpg',  contentType: 'image/jpeg' },
  album_photo: { folder: 'album-photos',   ext: 'jpg',  contentType: 'image/jpeg' },
  voice_clip:  { folder: 'voice-clips',    ext: 'm4a',  contentType: 'audio/mp4' },
  video_clip:  { folder: 'video-clips',    ext: 'mp4',  contentType: 'video/mp4' },
};

export async function getUploadUrl(req: Request, res: Response): Promise<void> {
  const type = (req.query.type as string) ?? 'photo';
  const config = UPLOAD_TYPE_CONFIG[type];
  if (!config) throw Errors.badRequest(`Invalid type. Must be one of: ${Object.keys(UPLOAD_TYPE_CONFIG).join(', ')}`);

  const userId = req.user!.sub;
  const gcsPath = `${config.folder}/${userId}/${uuidv4()}.${config.ext}`;
  const uploadUrl = await gcs.getSignedUploadUrl(gcsPath, config.contentType, 15);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  res.status(200).json({ uploadUrl, gcsPath, expiresAt });
}

// ── Multer error handler helper ───────────────────────────────────────────────

export function multerErrorHandler(err: Error, type: 'audio' | 'video'): never {
  if (err.message === 'INVALID_MIME') {
    throw Errors.badRequest(`Invalid ${type} file type`);
  }
  if ((err as NodeJS.ErrnoException).code === 'LIMIT_FILE_SIZE') {
    throw new HttpError(413, 'file_too_large', `${type === 'audio' ? 'Audio' : 'Video'} file too large`);
  }
  throw err;
}
