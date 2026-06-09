/**
 * AI photo / face verification.
 * TODO: wire a vision provider (AWS Rekognition / Azure Face / FaceTec) to (a) detect a live
 * human in the submitted selfie/video and (b) match it against the user's profile photos.
 */
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

class StubAiVerificationAdapter implements AiVerificationAdapter {
  async verifyPhoto(mediaUrl: string, _profilePhotoUrls: string[]): Promise<VerificationResult> {
    // TODO: liveness + face-match. Stub auto-approves any submitted media.
    return mediaUrl ? { approved: true, score: 0.95 } : { approved: false, score: 0, reason: 'no_media' };
  }

  async verifyFace(videoUrl: string, _profilePhotoUrls: string[]): Promise<VerificationResult> {
    return videoUrl ? { approved: true, score: 0.97 } : { approved: false, score: 0, reason: 'no_media' };
  }
}

export const aiVerification: AiVerificationAdapter = new StubAiVerificationAdapter();
