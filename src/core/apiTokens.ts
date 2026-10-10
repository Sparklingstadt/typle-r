import { AppError } from './appError'

export type TokenScope = 'read' | 'write'

export const TOKEN_PREFIX = 'typle_'
export const MAX_TOKENS = 10
export const MAX_TOKEN_NAME = 50
export const TOKEN_LIFETIMES = [30, 90, 365, null] as const
export const DEFAULT_TOKEN_LIFETIME = 90

export type TokenLifetime = typeof TOKEN_LIFETIMES[number]
export type TokenRequest = { name: string; scope: TokenScope; expiresIn: TokenLifetime }
export type TokenSummary = {
  id: string
  name: string
  prefix: string
  scope: TokenScope
  createdAt: string
  expiresAt: string | null
  lastUsedAt: string | null
}

const isScope = (value: unknown): value is TokenScope => value === 'read' || value === 'write'
const isLifetime = (value: unknown): value is TokenLifetime => TOKEN_LIFETIMES.some(lifetime => lifetime === value)
const isDateText = (value: unknown): value is string | null => value === null || typeof value === 'string'

export function decodeTokenRequest(value: unknown): TokenRequest {
  if (!value || typeof value !== 'object') throw new AppError('invalidTokenRequest')
  const { name, scope, expiresIn } = value as Record<string, unknown>
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (!trimmed || trimmed.length > MAX_TOKEN_NAME || !isScope(scope) || !isLifetime(expiresIn)) {
    throw new AppError('invalidTokenRequest')
  }
  return { name: trimmed, scope, expiresIn }
}

export function decodeTokenSummaries(value: unknown): TokenSummary[] {
  if (!Array.isArray(value)) throw new AppError('invalidServerData')
  return value.map(item => {
    if (!item || typeof item !== 'object') throw new AppError('invalidServerData')
    const { id, name, prefix, scope, createdAt, expiresAt, lastUsedAt } = item as Record<string, unknown>
    if (typeof id !== 'string' || typeof name !== 'string' || typeof prefix !== 'string' || !isScope(scope) ||
      typeof createdAt !== 'string' || !isDateText(expiresAt) || !isDateText(lastUsedAt)) throw new AppError('invalidServerData')
    return { id, name, prefix, scope, createdAt, expiresAt, lastUsedAt }
  })
}

export function tokenExpiry(expiresIn: TokenLifetime, now: Date): Date | null {
  return expiresIn === null ? null : new Date(now.getTime() + expiresIn * 24 * 60 * 60 * 1000)
}

// `write` includes `read`.
export function allows(granted: TokenScope, needed: TokenScope) {
  return granted === 'write' || needed === 'read'
}

// 32 random bytes as base64url are 43 characters.
export function isTokenSecret(value: string) {
  return /^typle_[A-Za-z0-9_-]{43}$/.test(value)
}

export function bearerSecret(header: string | null): string | null {
  const secret = header?.match(/^bearer\s+(.+)$/i)?.[1]
  return secret !== undefined && isTokenSecret(secret) ? secret : null
}
