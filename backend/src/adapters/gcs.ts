import { env } from '../config/env';

// ── GCS adapter stub — replace with @google-cloud/storage when credentials are available ──

export interface GcsAdapter {
  uploadFile(localPath: string, destPath: string, mimeType: string): Promise<string>;
  uploadBuffer(buffer: Buffer, destPath: string, mimeType: string): Promise<string>;
  getSignedUrl(destPath: string, expiresMs: number): Promise<string>;
  getSignedUploadUrl(destPath: string, contentType: string, expiryMinutes: number): Promise<string>;
  deleteFile(destPath: string): Promise<void>;
}

class StubGcsAdapter implements GcsAdapter {
  async uploadFile(_localPath: string, destPath: string, _mimeType: string): Promise<string> {
    if (env.isProd) throw new Error('GCS credentials not configured');
    return destPath;
  }

  async uploadBuffer(_buffer: Buffer, destPath: string, _mimeType: string): Promise<string> {
    if (env.isProd) throw new Error('GCS credentials not configured');
    return destPath;
  }

  async getSignedUrl(destPath: string, _expiresMs: number): Promise<string> {
    if (env.isProd) throw new Error('GCS credentials not configured');
    return `https://storage.googleapis.com/${env.gcs.bucket}/${destPath}?stub=1`;
  }

  async getSignedUploadUrl(destPath: string, _contentType: string, _expiryMinutes: number): Promise<string> {
    if (env.isProd) throw new Error('GCS credentials not configured');
    return `https://storage.googleapis.com/${env.gcs.bucket}/${destPath}?upload=1&stub=1`;
  }

  async deleteFile(_destPath: string): Promise<void> {
    // no-op in dev
  }
}

export const gcs: GcsAdapter = new StubGcsAdapter();
