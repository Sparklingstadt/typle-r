import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { AppError } from '../../../core/appError'
import { MAX_TOKENS, TOKEN_PREFIX, tokenExpiry, type TokenRequest, type TokenScope, type TokenSummary } from '../../../core/apiTokens'

const HOUR = 60 * 60 * 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const hashToken = (secret: string) => createHash('sha256').update(secret).digest('hex')

type TokenRow = {
  tokenId: string
  name: string
  prefix: string
  scope: string
  createdAt: Date
  expiresAt: Date | null
  lastUsedAt: Date | null
}

const summary = (row: TokenRow): TokenSummary => ({
  id: row.tokenId,
  name: row.name,
  prefix: row.prefix,
  scope: row.scope as TokenScope,
  createdAt: row.createdAt.toISOString(),
  expiresAt: row.expiresAt?.toISOString() ?? null,
  lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
})

export function tokenRepository(client: PrismaClient) {
  return {
    async list(ownerId: string): Promise<TokenSummary[]> {
      const rows = await client.apiToken.findMany({ where: { ownerId }, orderBy: [{ createdAt: 'desc' }, { tokenId: 'desc' }] })
      return rows.map(summary)
    },
    /** The secret is returned here and nowhere else; only its hash is stored. */
    async create(ownerId: string, request: TokenRequest, now = new Date()): Promise<{ token: TokenSummary; secret: string }> {
      const secret = TOKEN_PREFIX + randomBytes(32).toString('base64url')
      const row = await client.$transaction(async tx => {
        // Serialises one owner's creations, so concurrent requests cannot pass the count together.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`
        if (await tx.apiToken.count({ where: { ownerId } }) >= MAX_TOKENS) throw new AppError('tokenLimit', { max: MAX_TOKENS })
        return tx.apiToken.create({
          data: {
            tokenId: randomUUID(), ownerId, name: request.name, tokenHash: hashToken(secret), prefix: secret.slice(0, 10),
            scope: request.scope, createdAt: now, expiresAt: tokenExpiry(request.expiresIn, now),
          },
        })
      })
      return { token: summary(row), secret }
    },
    /** True only when the owner's own token was deleted. */
    async revoke(ownerId: string, tokenId: string): Promise<boolean> {
      if (!UUID.test(tokenId)) return false
      const { count } = await client.apiToken.deleteMany({ where: { tokenId, ownerId } })
      return count > 0
    },
    async verify(secret: string, now = new Date()): Promise<{ ownerId: string; scope: TokenScope } | null> {
      const row = await client.apiToken.findUnique({ where: { tokenHash: hashToken(secret) } })
      if (!row || (row.expiresAt && row.expiresAt <= now)) return null
      // Recorded at most hourly, so a busy client does not write on every request.
      await client.apiToken.updateMany({
        where: { tokenId: row.tokenId, OR: [{ lastUsedAt: null }, { lastUsedAt: { lte: new Date(now.getTime() - HOUR) } }] },
        data: { lastUsedAt: now },
      })
      return { ownerId: row.ownerId, scope: row.scope as TokenScope }
    },
  }
}
