/**
 * Image moderation.
 *
 * STATUS: NO image-moderation provider is wired. AWS Rekognition was scaffolded
 * but never implemented (`callRekognition` below has always thrown), so every
 * caller has effectively been getting `allow` for every image.
 *
 * Rather than keep that implicit, the behaviour is now named and operator-
 * controlled:
 *   - provider not configured → IMAGE_MODERATION_FALLBACK ('allow' | 'manual_review')
 *   - provider configured but the call fails → 'manual_review' (never silently allow)
 *
 * The fallback defaults to 'allow' because callers treat 'manual_review' as
 * "upload but do not publish" (see profile.controller `isPublished`), so
 * defaulting to review would leave every user in production with no visible
 * photo. Operators who would rather queue everything for a human can set
 * IMAGE_MODERATION_FALLBACK=manual_review.
 *
 * `imageModerationConfigured` is exported so the launch checklist and any
 * status surface can tell the truth about whether moderation is actually active;
 * production logs a loud warning at startup when it is not.
 *
 * TO ACTIVATE (external setup required — no code change needed beyond
 * implementing `callRekognition`):
 *   1. AWS account + IAM user with `rekognition:DetectModerationLabels`
 *   2. Set AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
 *   3. Implement callRekognition() against DetectModerationLabels
 */
import { env } from '../config/env';

export type ImageModerationResult = 'allow' | 'manual_review' | 'reject';

interface RekognitionLabel {
  Name: string;
  Confidence: number;
  ParentName?: string;
}

// Labels that trigger immediate rejection
const REJECT_LABELS = new Set([
  'Explicit Nudity',
  'Graphic Violence or Gore',
  'Hate Symbols',
  'Violence',
]);

// Labels that require manual review
const REVIEW_LABELS = new Set([
  'Suggestive',
  'Partial Nudity',
  'Drug Use',
  'Tobacco',
]);

/**
 * True only when a real moderation provider can actually be called. Today that
 * requires AWS credentials AND the `callRekognition` implementation below —
 * which is still a stub, hence the hard `false`. Flip the second operand once
 * DetectModerationLabels is genuinely wired.
 */
const REKOGNITION_IMPLEMENTED = false;
export const imageModerationConfigured: boolean =
  REKOGNITION_IMPLEMENTED && Boolean(env.aws.accessKeyId && env.aws.secretAccessKey);

async function callRekognition(_imageUrl: string): Promise<RekognitionLabel[]> {
  // TODO (production): fetch the image bytes (or pass an S3Object) and call
  // AWS Rekognition DetectModerationLabels via @aws-sdk/client-rekognition.
  throw new Error('Rekognition DetectModerationLabels is not implemented');
}

/** What to return when no provider is wired. Explicit, and operator-overridable. */
const FALLBACK: ImageModerationResult =
  process.env.IMAGE_MODERATION_FALLBACK === 'manual_review' ? 'manual_review' : 'allow';

if (!imageModerationConfigured && env.isProd) {
  // eslint-disable-next-line no-console
  console.warn(JSON.stringify({
    event: 'image_moderation_inactive',
    message: 'No image-moderation provider is wired. Every uploaded image is returned as ' +
      `"${FALLBACK}" without inspection. Set IMAGE_MODERATION_FALLBACK=manual_review to ` +
      'queue uploads for human review instead.',
  }));
}

export async function moderateImage(imageUrl: string): Promise<ImageModerationResult> {
  if (!imageModerationConfigured) return FALLBACK;

  try {
    const labels = await callRekognition(imageUrl);
    for (const label of labels) {
      if (label.Confidence >= 80 && REJECT_LABELS.has(label.Name)) return 'reject';
    }
    for (const label of labels) {
      if (label.Confidence >= 70 && REVIEW_LABELS.has(label.Name)) return 'manual_review';
    }
    return 'allow';
  } catch {
    // Provider failure (network, quota, throttling) — never silently allow.
    return 'manual_review';
  }
}
