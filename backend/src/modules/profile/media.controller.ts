import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { prisma } from '../../config/prisma';
import { mediaStorage } from '../../adapters/r2';
import { env } from '../../config/env';
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

  const key = `voice-clips/${userId}/${uuidv4()}.m4a`;
  await mediaStorage.uploadBuffer(file.buffer, key, 'audio/mp4');

  await prisma.user.update({ where: { id: userId }, data: { voiceClipUrl: key } });

  const signedUrl = await signUrl(key);
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

  const key = `video-clips/${userId}/${uuidv4()}.mp4`;
  await mediaStorage.uploadBuffer(file.buffer, key, 'video/mp4');

  await prisma.user.update({ where: { id: userId }, data: { videoClipUrl: key } });

  const signedUrl = await signUrl(key);
  res.status(200).json({ videoClipUrl: signedUrl, thumbnailUrl: null });
}

// ── Signed upload URL — GET /me/upload-url ────────────────────────────────────

type UploadScope = 'user' | 'room';
const UPLOAD_TYPE_CONFIG: Record<
  string,
  { folder: string; ext: string; contentType: string; scope: UploadScope }
> = {
  photo:       { folder: 'profile-photos', ext: 'jpg', contentType: 'image/jpeg',              scope: 'user' },
  album_photo: { folder: 'album-photos',   ext: 'jpg', contentType: 'image/jpeg',              scope: 'user' },
  chat_photo:  { folder: 'chat-photos',    ext: 'jpg', contentType: 'image/jpeg',              scope: 'user' },
  voice_clip:  { folder: 'voice-clips',    ext: 'm4a', contentType: 'audio/mp4',               scope: 'user' },
  video_clip:  { folder: 'video-clips',    ext: 'mp4', contentType: 'video/mp4',               scope: 'user' },
  // Generic room-chat media (video/document/audio/room image).
  video:       { folder: 'video-clips',    ext: 'mp4', contentType: 'video/mp4',               scope: 'user' },
  document:    { folder: 'documents',      ext: 'bin', contentType: 'application/octet-stream', scope: 'user' },
  audio:       { folder: 'audio',          ext: 'm4a', contentType: 'audio/mp4',               scope: 'user' },
  room_image:  { folder: 'room-media',     ext: 'jpg', contentType: 'image/jpeg',              scope: 'room' },
};

export async function getUploadUrl(req: Request, res: Response): Promise<void> {
  const type = (req.query.type as string) ?? 'photo';
  const config = UPLOAD_TYPE_CONFIG[type];
  if (!config) throw Errors.badRequest(`Invalid type. Must be one of: ${Object.keys(UPLOAD_TYPE_CONFIG).join(', ')}`);

  const userId = req.user!.sub;

  // Optional caller overrides: document extension, arbitrary content type, and
  // (for room media) the target room id used to scope the object key.
  const extOverride = (req.query.ext as string | undefined)?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
  const ext = type === 'document' && extOverride ? extOverride : config.ext;
  const contentType = (req.query.contentType as string | undefined) || config.contentType;

  let scopeId = userId;
  if (config.scope === 'room') {
    const roomId = req.query.roomId as string | undefined;
    if (!roomId) throw Errors.badRequest('roomId is required for room_image uploads');
    scopeId = roomId;
  }

  const key = `${config.folder}/${scopeId}/${uuidv4()}.${ext}`;
  const uploadUrl = await mediaStorage.getSignedUploadUrl(key, contentType, 15);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  // Public URL when a media base domain is configured; otherwise the raw key,
  // which signUrl() will presign on read.
  const mediaUrl = env.mediaBaseUrl ? `${env.mediaBaseUrl}/${key}` : key;

  res.status(200).json({ uploadUrl, key, mediaUrl, expiresAt });
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
