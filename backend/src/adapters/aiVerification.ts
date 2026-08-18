/**
 * AI photo / face verification.
 * TODO: wire a vision provider (AWS Rekognition / Azure Face / FaceTec) to (a) detect a live
 * human in the submitted selfie/video and (b) match it against the user's profile photos.
 */
import { env } from '../config/env';

export interface AiVerificationAdapter {
  /** Confirm a submitted selfie photo is an authentic, live human. */
  verifyPhoto(mediaUrl: string, profilePhotoUrls: string[]): Promise<VerificationResult>;
  /** Confirm a video-selfie is a live person matching the profile photos (face check). */
  verifyFace(videoUrl: string, profilePhotoUrls: string[]): Promise<VerificationResult>;
}

export interface VerificationResult {
  approved: boolean;
  score: number; // 0..1 confidence
  reason?: string;
}

/** Sentinel reason meaning "no automated decision was made — queue for a human". */
export const MANUAL_REVIEW_REASON = 'manual_review_required';

/**
 * No vision provider is wired yet. In development the stub auto-approves so the
 * flow is testable end to end; in production it must NOT hand out a
 * photo-verified badge nobody checked, so it defers to manual review instead.
 */
class StubAiVerificationAdapter implements AiVerificationAdapter {
  private undecided(): VerificationResult {
    return { approved: false, score: 0, reason: MANUAL_REVIEW_REASON };
  }

  async verifyPhoto(mediaUrl: string, _profilePhotoUrls: string[]): Promise<VerificationResult> {
    if (!mediaUrl) return { approved: false, score: 0, reason: 'no_media' };
    if (env.isProd) return this.undecided();
    return { approved: true, score: 0.95 };
  }

  async verifyFace(videoUrl: string, _profilePhotoUrls: string[]): Promise<VerificationResult> {
    if (!videoUrl) return { approved: false, score: 0, reason: 'no_media' };
    if (env.isProd) return this.undecided();
    return { approved: true, score: 0.97 };
  }
}

export const aiVerification: AiVerificationAdapter = new StubAiVerificationAdapter();
