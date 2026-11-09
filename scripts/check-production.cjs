// Checks production after `vercel deploy --prod` (docs/release-workflow.md): what the deploy job of the CI workflow
// did until v2.38.0. Run once the production domain serves the new deployment. Exits 1 when any check fails.
//
// The site is served at typle.sparklingstadt.com (SITE_URL and AUTH_URL). The Vercel domain typle-r-six.vercel.app
// stays for the iPad and Mac apps, which call /api/* there: vercel.json sends its pages, and the start of a login, to
// the custom domain, so that the OAuth cookie and the callback share one host.
const SITE = 'https://typle.sparklingstadt.com'
const LEGACY = 'https://typle-r-six.vercel.app'

const failures = []
function check(ok, message, detail) {
  console.log(`${ok ? 'ok' : 'NG'}  ${message}${ok ? '' : ` (${detail})`}`)
  if (!ok) failures.push(message)
}

/** fetch without following redirects, retried on network errors as curl --retry 3 did. */
async function request(url, init = {}) {
  let error
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(60000), ...init })
    } catch (e) {
      error = e
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
    }
  }
  throw error
}

async function main() {
  const home = await request(`${SITE}/home`, { redirect: 'follow' })
  check(home.ok, `GET ${SITE}/home succeeds`, `HTTP ${home.status}`)

  const legacyHome = await request(`${LEGACY}/home?from=check`)
  const legacyTarget = legacyHome.headers.get('location')
  check(legacyHome.status === 308 && legacyTarget === `${SITE}/home?from=check`,
    `the Vercel domain sends pages to ${SITE} with HTTP 308 and the query intact`, `HTTP ${legacyHome.status} ${legacyTarget}`)

  for (const origin of [SITE, LEGACY]) {
    const health = await request(`${origin}/api/health`)
    check(health.ok, `GET ${origin}/api/health succeeds (the Go function reaches the production DB)`, `HTTP ${health.status}`)
    const workspace = await request(`${origin}/api/workspace`)
    check(workspace.status === 401, `anonymous GET ${origin}/api/workspace answers 401`, `HTTP ${workspace.status}`)
  }

  const session = await request(`${SITE}/api/auth/session`)
  const sessionBody = await session.text()
  let parsed
  try { parsed = JSON.parse(sessionBody) } catch { parsed = null }
  check(session.ok && parsed && parsed.user === null && Array.isArray(parsed.providers) && parsed.providers.includes('github'),
    `anonymous ${SITE}/api/auth/session has a null user and a providers array containing github`, `HTTP ${session.status} ${sessionBody}`)

  const signin = await request(`${SITE}/api/auth/signin`)
  const signinTarget = signin.headers.get('location') ?? ''
  check(signin.status === 302 && signinTarget.startsWith('https://github.com/login/oauth/authorize?') &&
    signinTarget.includes('redirect_uri=https%3A%2F%2Ftyple.sparklingstadt.com%2Fapi%2Fauth%2Fcallback%2Fgithub'),
  `${SITE}/api/auth/signin redirects (302) to GitHub with the production callback`, `HTTP ${signin.status} ${signinTarget}`)

  // An app's login starts at the Vercel domain and must move to the custom domain with its query intact.
  const legacySignin = await request(`${LEGACY}/api/auth/signin?client=ipad&returnTo=%2Fplay`)
  const legacySigninTarget = legacySignin.headers.get('location')
  check(legacySignin.status === 307 && legacySigninTarget === `${SITE}/api/auth/signin?client=ipad&returnTo=%2Fplay`,
    `the Vercel domain sends sign-in to ${SITE} with HTTP 307 and the query intact`, `HTTP ${legacySignin.status} ${legacySigninTarget}`)

  // The iPad app's token exchange is deployed at the Vercel domain it calls, and refuses a request without a valid code.
  const token = await request(`${LEGACY}/api/auth/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  const tokenBody = (await token.text()).trim()
  check(token.status === 400 && tokenBody === '{"error":"loginFailed"}',
    `POST ${LEGACY}/api/auth/token with {} answers 400 loginFailed`, `HTTP ${token.status} ${tokenBody}`)

  if (failures.length) {
    console.error(`\n${failures.length} production check(s) failed`)
    process.exit(1)
  }
  console.log('\nProduction checks passed')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
