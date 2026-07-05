import { getUploadUrl, type UploadType } from '../services/api';

/**
 * Read a local file URI as a Blob via XHR (RN's fetch().blob() throws on
 * ArrayBuffer-backed blobs; the XHR blob bridge handles file:///content://).
 */
function readFileAsBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.responseType = 'blob';
    xhr.onload = () => {
      if (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) {
        resolve(xhr.response as Blob);
      } else {
        reject(new Error(`Failed to read file (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Failed to read file'));
    xhr.open('GET', uri);
    xhr.send();
  });
}

/** PUT a blob to a presigned R2 URL, reporting upload progress (0..1). */
function putWithProgress(
  uploadUrl: string,
  blob: Blob,
  contentType: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`R2 upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('R2 upload failed'));
    xhr.send(blob);
  });
}

export interface UploadOptions {
  roomId?: string;
  ext?: string;
  onProgress?: (fraction: number) => void;
}

/**
 * Upload a local file directly to R2 via a presigned URL and return the final
 * mediaUrl to store on the message. No bytes pass through our backend.
 */
export async function uploadToR2(
  localUri: string,
  type: UploadType,
  contentType: string,
  opts: UploadOptions = {},
): Promise<string> {
  const { uploadUrl, mediaUrl } = await getUploadUrl({
    type,
    contentType,
    ext: opts.ext,
    roomId: opts.roomId,
  });
  const blob = await readFileAsBlob(localUri);
  await putWithProgress(uploadUrl, blob, contentType, opts.onProgress);
  return mediaUrl;
}
