import crypto from 'crypto';

/**
 * Encryption utilities for end-to-end encrypted messaging
 * Uses AES-256-GCM for symmetric encryption
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Generate a random encryption key
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('base64');
}

/**
 * Generate a random initialization vector
 */
export function generateIV(): string {
  return crypto.randomBytes(IV_LENGTH).toString('base64');
}

/**
 * Encrypt text using AES-256-GCM
 * @param text - Plain text to encrypt
 * @param key - Base64 encoded encryption key
 * @returns Object containing encrypted content, IV, and auth tag
 */
export function encryptMessage(text: string, key: string): {
  encryptedContent: string;
  iv: string;
  authTag: string;
} {
  const iv = crypto.randomBytes(IV_LENGTH);
  const keyBuffer = Buffer.from(key, 'base64');

  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  return {
    encryptedContent: encrypted,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64')
  };
}

/**
 * Decrypt text using AES-256-GCM
 * @param encryptedContent - Base64 encoded encrypted content
 * @param key - Base64 encoded encryption key
 * @param iv - Base64 encoded initialization vector
 * @param authTag - Base64 encoded authentication tag
 * @returns Decrypted plain text
 */
export function decryptMessage(
  encryptedContent: string,
  key: string,
  iv: string,
  authTag: string
): string {
  const keyBuffer = Buffer.from(key, 'base64');
  const ivBuffer = Buffer.from(iv, 'base64');
  const authTagBuffer = Buffer.from(authTag, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, ivBuffer);
  decipher.setAuthTag(authTagBuffer);

  let decrypted = decipher.update(encryptedContent, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generate RSA key pair for user encryption keys
 * Public key is stored on server, private key encrypted with user's password
 */
export function generateRSAKeyPair(): {
  publicKey: string;
  privateKey: string;
} {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  return {
    publicKey,
    privateKey
  };
}

/**
 * Encrypt private key with user's password-derived key
 * @param privateKey - RSA private key in PEM format
 * @param password - User's password
 * @returns Encrypted private key
 */
export function encryptPrivateKey(privateKey: string, password: string): {
  encryptedKey: string;
  salt: string;
  iv: string;
} {
  // Generate salt for key derivation
  const salt = crypto.randomBytes(16);

  // Derive key from password using PBKDF2
  const derivedKey = crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha256');

  // Generate IV for encryption
  const iv = crypto.randomBytes(IV_LENGTH);

  // Encrypt private key
  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Combine encrypted key and auth tag
  const combined = encrypted + '.' + authTag.toString('base64');

  return {
    encryptedKey: combined,
    salt: salt.toString('base64'),
    iv: iv.toString('base64')
  };
}

/**
 * Decrypt private key with user's password
 * @param encryptedKey - Encrypted private key (includes auth tag)
 * @param password - User's password
 * @param salt - Base64 encoded salt
 * @param iv - Base64 encoded IV
 * @returns Decrypted private key in PEM format
 */
export function decryptPrivateKey(
  encryptedKey: string,
  password: string,
  salt: string,
  iv: string
): string {
  // Split encrypted key and auth tag
  const [encrypted, authTagB64] = encryptedKey.split('.');

  // Derive key from password
  const saltBuffer = Buffer.from(salt, 'base64');
  const derivedKey = crypto.pbkdf2Sync(password, saltBuffer, 100000, KEY_LENGTH, 'sha256');

  // Decrypt
  const ivBuffer = Buffer.from(iv, 'base64');
  const authTagBuffer = Buffer.from(authTagB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, ivBuffer);
  decipher.setAuthTag(authTagBuffer);

  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Hash a password using bcrypt-compatible algorithm
 * (For reference - actual password hashing should use bcryptjs)
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify password against hash
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':');
  const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
}

/**
 * Generate a secure random token
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url');
}
