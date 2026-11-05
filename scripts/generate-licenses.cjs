// Collects the licenses of everything the app ships that others wrote, for the page /about/licenses: every npm
// package installed for production (package-lock.json entries without `dev` or `devOptional`; optional packages for
// other platforms are not installed and are left out), and the files that do not come from npm (EXTRAS). Writes, into
// public/licenses (not committed), third-party.json (the list the page shows) and third-party.txt (every license text).
// Run on every install and before a build, so the list always matches the installed packages.
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')

// Shipped files that are not npm packages: the font next/font downloads at build time, and the handwriting model.
const EXTRAS = [
  {
    name: 'Noto Sans JP', version: '', license: 'OFL-1.1', url: 'https://fonts.google.com/noto/specimen/Noto+Sans+JP',
    text: 'scripts/third-party/noto-sans-jp-OFL-1.1.txt',
  },
  {
    name: 'PaddleOCR korean_PP-OCRv5_mobile_rec (ONNX)', version: '', license: 'Apache-2.0',
    url: 'https://github.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models', text: 'public/handwriting/LICENSE-models.txt',
  },
]

// License texts for shipped packages whose npm package has no license file, taken from their source repository.
const MISSING_TEXTS = {
  // https://github.com/microsoft/onnxruntime/blob/v1.31.1/LICENSE
  'onnxruntime-web': 'scripts/third-party/onnxruntime-LICENSE.txt',
  'onnxruntime-common': 'scripts/third-party/onnxruntime-LICENSE.txt',
}

const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.|-|$)/iu

function licenseOf(pkg) {
  if (typeof pkg.license === 'string') return pkg.license
  if (pkg.license && typeof pkg.license.type === 'string') return pkg.license.type
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map(entry => entry.type ?? entry).join(' OR ')
  return 'UNKNOWN'
}

function urlOf(pkg) {
  const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
  const url = pkg.homepage || repository || ''
  return url.replace(/^git\+/u, '').replace(/\.git$/u, '').replace(/^git:\/\//u, 'https://').replace(/^github:/u, 'https://github.com/')
}

function textsIn(directory) {
  return fs.readdirSync(directory).filter(file => LICENSE_FILE.test(file) && fs.statSync(path.join(directory, file)).isFile()).sort()
    .map(file => fs.readFileSync(path.join(directory, file), 'utf8').trim())
}

/** The shipped third-party software under `base`, sorted by name: { name, version, license, url, text }. */
function collectLicenses(base = root) {
  const lock = JSON.parse(fs.readFileSync(path.join(base, 'package-lock.json'), 'utf8'))
  const seen = new Map()
  for (const [location, entry] of Object.entries(lock.packages)) {
    // devOptional: needed only by development packages, or an optional peer of a shipped one (Playwright for Next.js).
    if (!location.startsWith('node_modules/') || entry.dev || entry.devOptional) continue
    const directory = path.join(base, location)
    if (!fs.existsSync(path.join(directory, 'package.json'))) continue
    const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'))
    const name = pkg.name ?? location.slice(location.lastIndexOf('node_modules/') + 'node_modules/'.length)
    const key = `${name}@${pkg.version}`
    if (seen.has(key)) continue
    const missing = MISSING_TEXTS[name]
    const text = textsIn(directory).join('\n\n') || (missing ? fs.readFileSync(path.join(base, missing), 'utf8').trim() : '')
    seen.set(key, { name, version: pkg.version ?? '', license: licenseOf(pkg), url: urlOf(pkg), text })
  }
  for (const extra of EXTRAS) {
    seen.set(extra.name, { ...extra, text: fs.readFileSync(path.join(base, extra.text), 'utf8').trim() })
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'en') || a.version.localeCompare(b.version, 'en'))
}

function write(entries, out = path.join(root, 'public', 'licenses')) {
  fs.mkdirSync(out, { recursive: true })
  const list = entries.map(({ name, version, license, url, text }) => ({ name, version, license, url, hasText: text !== '' }))
  fs.writeFileSync(path.join(out, 'third-party.json'), JSON.stringify(list))
  const rule = '='.repeat(80)
  const body = entries.map(({ name, version, license, url, text }) => [
    rule, `${name}${version ? ` ${version}` : ''}`, `License: ${license}`, ...(url ? [url] : []), '',
    text || `(The package includes no license file. License: ${license})`,
  ].join('\n')).join('\n\n')
  fs.writeFileSync(path.join(out, 'third-party.txt'), `Third-party software in Typle\n\n${body}\n`)
}

if (require.main === module) write(collectLicenses())

module.exports = { collectLicenses, write }
