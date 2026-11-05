// What search engines are pointed at (sitemap.xml) and kept away from (robots.txt).
// Kept free of Next.js so the rules can be unit-tested.

export type SitemapEntry = {
  url: string
  changeFrequency: 'weekly' | 'monthly'
  priority: number
}

export type RobotsRules = {
  rules: { userAgent: string; allow: string; disallow: string[] }
  sitemap: string
  host: string
}

// Pages that open without a login and say the same thing to every visitor.
// Pages that show the visitor's own lists or records (records, rankings, edit, ...) are left out:
// a crawler would only see an empty workspace there.
export const INDEXED_PATHS: readonly { path: string; changeFrequency: SitemapEntry['changeFrequency']; priority: number }[] = [
  { path: '/home', changeFrequency: 'weekly', priority: 1 },
  { path: '/play', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/gallery', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/guide', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.5 },
]

// The admin screen, the development login and the backend have nothing for a search result.
export const DISALLOWED_PATHS: readonly string[] = ['/admin', '/local-login', '/api/']

export function siteOrigin(siteUrl: string): string {
  return new URL(siteUrl).origin
}

export function sitemapEntries(siteUrl: string): SitemapEntry[] {
  const origin = siteOrigin(siteUrl)
  return INDEXED_PATHS.map(({ path, changeFrequency, priority }) => ({ url: `${origin}${path}`, changeFrequency, priority }))
}

export function robotsRules(siteUrl: string): RobotsRules {
  const origin = siteOrigin(siteUrl)
  return {
    rules: { userAgent: '*', allow: '/', disallow: [...DISALLOWED_PATHS] },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  }
}
