// pg treats sslmode=prefer, require and verify-ca as verify-full and warns that v9 will give them libpq's weaker meaning.
// The app's connection names verify-full so it keeps verifying the server certificate. DATABASE_URL itself is left alone:
// it is managed by the Neon integration, and Prisma's migration engine does not know verify-full.
const PG_VERIFY_FULL_ALIASES = new Set(['prefer', 'require', 'verify-ca'])

export function strictSslUrl(connectionString: string) {
  let url: URL
  try { url = new URL(connectionString) } catch { return connectionString }
  const mode = url.searchParams.get('sslmode')
  if (!mode || !PG_VERIFY_FULL_ALIASES.has(mode) || url.searchParams.get('uselibpqcompat') === 'true') return connectionString
  url.searchParams.set('sslmode', 'verify-full')
  return url.toString()
}
