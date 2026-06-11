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

async function callRekognition(imageUrl: string): Promise<RekognitionLabel[]> {
  // Dynamically import AWS SDK only when keys are configured
  // Using a fetch-based minimal call to avoid SDK bundle in dev
  const { region, accessKeyId, secretAccessKey } = env.aws;

  // Build the AWS Signature v4 request
  const endpoint = `https://rekognition.${region}.amazonaws.com/`;
  const body = JSON.stringify({
    Image: { Bytes: undefined, S3Object: undefined, ExternalImageId: undefined },
    // In real usage, pass either S3Object or pre-fetched Bytes
    // For stub: pass a placeholder; real implementation fetches image bytes first
  });

  // Minimal stub that signals misconfiguration in dev gracefully
  void body; void endpoint; void accessKeyId; void secretAccessKey;
  throw new Error('Rekognition not implemented — use dev fallback');
}

export async function moderateImage(imageUrl: string): Promise<ImageModerationResult> {
  const { accessKeyId } = env.aws;

  if (!accessKeyId) {
    // Dev fallback: allow all images when AWS is not configured
    return 'allow';
  }

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
    // If Rekognition fails (network, quota, etc.), fall back to manual_review to be safe
    return env.isProd ? 'manual_review' : 'allow';
  }
}
