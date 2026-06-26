import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl as presign } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';

export interface MediaStorageAdapter {
  uploadFile(localPath: string, destPath: string, mimeType: string): Promise<string>;
  uploadBuffer(buffer: Buffer, destPath: string, mimeType: string): Promise<string>;
  getSignedUrl(destPath: string, expiresMs: number): Promise<string>;
  getSignedUploadUrl(destPath: string, contentType: string, expiryMinutes: number): Promise<string>;
  deleteFile(destPath: string): Promise<void>;
}

function isR2Configured(): boolean {
  return Boolean(
    env.r2.bucket &&
      env.r2.accessKeyId &&
      env.r2.secretAccessKey &&
      env.r2.endpoint,
  );
}

function createClient(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: env.r2.endpoint,
    credentials: {
      accessKeyId: env.r2.accessKeyId,
      secretAccessKey: env.r2.secretAccessKey,
    },
  });
}

class R2StorageAdapter implements MediaStorageAdapter {
  private client = createClient();

  async uploadFile(_localPath: string, destPath: string, _mimeType: string): Promise<string> {
    throw new Error('uploadFile not implemented — use uploadBuffer or signed upload URLs');
  }

  async uploadBuffer(buffer: Buffer, destPath: string, mimeType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: env.r2.bucket,
        Key: destPath,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
    return destPath;
  }

  async getSignedUrl(destPath: string, expiresMs: number): Promise<string> {
    const command = new GetObjectCommand({ Bucket: env.r2.bucket, Key: destPath });
    return presign(this.client, command, { expiresIn: Math.max(1, Math.floor(expiresMs / 1000)) });
  }

  async getSignedUploadUrl(destPath: string, contentType: string, expiryMinutes: number): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: env.r2.bucket,
      Key: destPath,
      ContentType: contentType,
    });
    return presign(this.client, command, { expiresIn: expiryMinutes * 60 });
  }

  async deleteFile(destPath: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: env.r2.bucket, Key: destPath }));
  }
}

class StubStorageAdapter implements MediaStorageAdapter {
  async uploadFile(_localPath: string, destPath: string, _mimeType: string): Promise<string> {
    if (env.isProd) throw new Error('R2 credentials not configured');
    return destPath;
  }

  async uploadBuffer(_buffer: Buffer, destPath: string, _mimeType: string): Promise<string> {
    if (env.isProd) throw new Error('R2 credentials not configured');
    return destPath;
  }

  async getSignedUrl(destPath: string, _expiresMs: number): Promise<string> {
    if (env.isProd) throw new Error('R2 credentials not configured');
    const base = env.mediaBaseUrl || `https://${env.r2.bucket}.r2.cloudflarestorage.com`;
    return `${base}/${destPath}?stub=1`;
  }

  async getSignedUploadUrl(destPath: string, _contentType: string, _expiryMinutes: number): Promise<string> {
    if (env.isProd) throw new Error('R2 credentials not configured');
    const base = env.mediaBaseUrl || `https://${env.r2.bucket}.r2.cloudflarestorage.com`;
    return `${base}/${destPath}?upload=1&stub=1`;
  }

  async deleteFile(_destPath: string): Promise<void> {
    // no-op in dev without R2
  }
}

export const r2Configured = isR2Configured();
export const mediaStorage: MediaStorageAdapter = r2Configured
  ? new R2StorageAdapter()
  : new StubStorageAdapter();
