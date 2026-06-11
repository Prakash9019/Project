import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_HEX   = process.env.ENCRYPTION_KEY ?? ''

function getKey(): Buffer {
  if (!KEY_HEX || KEY_HEX.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex chars)')
  }
  return Buffer.from(KEY_HEX, 'hex')
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, dataHex] = ciphertext.split(':')
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return decipher.update(Buffer.from(dataHex, 'hex')) + decipher.final('utf8')
}

export function safeDecrypt(ciphertext: string | null | undefined): string | null {
  if (!ciphertext) return null
  try { return decrypt(ciphertext) } catch { return null }
}
