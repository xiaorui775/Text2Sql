import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

const ENCRYPTION_KEY: Buffer = (() => {
  const secret = process.env.ENCRYPTION_KEY || process.env.DATABASE_URL || 'default-encryption-key-fallback'
  return scryptSync(secret, 'salt', 32)
})()

export function encrypt(text: string): string {
  if (!text) return text

  const key = ENCRYPTION_KEY
  const iv = randomBytes(IV_LENGTH)

  const cipher = createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const authTag = cipher.getAuthTag()

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

export function decrypt(encryptedData: string): string {
  if (!encryptedData || !encryptedData.includes(':')) {
    return encryptedData
  }

  const key = ENCRYPTION_KEY
  const parts = encryptedData.split(':')

  if (parts.length !== 3) {
    return encryptedData
  }

  const [ivHex, authTagHex, encrypted] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}
