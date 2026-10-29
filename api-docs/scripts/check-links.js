// Checks that every link between the built pages reaches a page, and the heading its #fragment names.
// Run after docs:build: node scripts/check-links.js [dist]
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const dist = process.argv[2] ?? 'src/.vuepress/dist'

const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')

const pages = new Map()
for (const file of readdirSync(dist, { recursive: true })) {
  if (file.endsWith('.html')) pages.set('/' + file.split(path.sep).join('/'), readFileSync(path.join(dist, file), 'utf8'))
}
const ids = new Map([...pages].map(([page, html]) => [page, new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => unescape(m[1])))]))

const problems = []
for (const [page, html] of pages) {
  for (const [, raw] of html.matchAll(/ href="([^"]+)"/g)) {
    const href = unescape(raw)
    if (/^(https?:|mailto:)/.test(href) || href.startsWith('/assets/')) continue
    const url = new URL(href, 'http://docs' + page)
    let target = decodeURIComponent(url.pathname)
    if (target.endsWith('/')) target += 'index.html'
    if (!pages.has(target)) {
      problems.push(`${page}: no page for ${href}`)
      continue
    }
    const fragment = decodeURIComponent(url.hash.slice(1))
    if (fragment && !ids.get(target).has(fragment)) problems.push(`${page}: no heading for ${href}`)
  }
}

for (const problem of problems) console.error(problem)
console.log(`Checked the links of ${pages.size} pages: ${problems.length} broken`)
process.exitCode = problems.length === 0 ? 0 : 1
