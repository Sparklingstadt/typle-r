const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { appendFileSync, readFileSync } = require('node:fs')

function validatePolicy({ event, sha, parentLine, commits, repo, prs, repository }) {
  assert.equal(event.ref, 'refs/heads/main', 'Only main may publish')
  assert.equal(event.after, sha, 'Push SHA mismatch')
  assert.equal(event.forced, false, 'Force pushes cannot publish')
  assert.deepEqual(parentLine.trim().split(/\s+/), [sha, event.before], 'Require exactly one parent: the previous main commit')
  assert.equal(commits, '1', 'Require one squash commit per main push')
  assert.equal(repo.allow_squash_merge, true, 'Enable squash merging')
  assert.equal(repo.allow_merge_commit, false, 'Disable merge commits in repository settings')
  assert.equal(repo.allow_rebase_merge, false, 'Disable rebase merging in repository settings')
  const matches = prs.filter(pr => pr.merged_at && pr.merge_commit_sha === sha &&
    pr.base.ref === 'main' && pr.base.repo.full_name === repository)
  assert.equal(matches.length, 1, 'Require exactly one merged PR for this squash commit')
}

function releaseTag(version) {
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'package.json version must be a stable X.Y.Z version')
  return `v${version}`
}

function validateRelease(release, tag, resolvedSha, sha) {
  assert.equal(release.tag_name, tag, 'Unexpected release tag')
  assert.equal(release.draft, false, 'Release must be published')
  assert.equal(release.prerelease, false, 'Release must not be a prerelease')
  assert.equal(resolvedSha, sha, 'Release tag must point to the verified commit; never move a tag')
}

function run(mode) {
  const repository = process.env.GITHUB_REPOSITORY
  const sha = process.env.GITHUB_SHA
  assert.match(repository || '', /^[\w.-]+\/[\w.-]+$/)
  assert.match(sha || '', /^[a-f0-9]{40}$/)
  const command = (bin, args) => execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const git = (...args) => command('git', args)
  const gh = (...args) => command('gh', args)
  const api = path => JSON.parse(gh('api', `repos/${repository}/${path}`))
  const pages = path => JSON.parse(gh('api', '--paginate', '--slurp', `repos/${repository}/${path}`)).flat()
  const assertCurrent = () => assert.equal(api('git/ref/heads/main').object.sha, sha,
    'main has advanced: do not release or redeploy an older run. Finish each release before merging the next PR.')
  assert.equal(git('rev-parse', 'HEAD'), sha, 'Checkout must match the verified push SHA')
  assertCurrent()

  if (mode === 'policy') {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
    validatePolicy({ event, sha, repository,
      parentLine: git('rev-list', '--parents', '-n', '1', sha),
      commits: git('rev-list', '--count', `${event.before}..${sha}`),
      repo: JSON.parse(gh('api', `repos/${repository}`)),
      prs: pages(`commits/${sha}/pulls?per_page=100`),
    })
    console.log('Verified a merged PR, single-parent commit, and squash-only repository settings.')
    return
  }

  const tag = releaseTag(JSON.parse(readFileSync('package.json', 'utf8')).version)
  if (mode === 'check') assert.equal(process.env.RELEASE_TAG, tag)
  else assert.equal(mode, 'publish', 'Unknown release operation')
  // Use REST tag resolution, including annotated tags; never trust target_commitish alone.
  const resolveTag = () => {
    let object = api(`git/ref/tags/${tag}`).object
    for (let depth = 0; object.type === 'tag' && depth < 8; depth++) {
      object = api(`git/tags/${object.sha}`).object
    }
    assert.equal(object.type, 'commit', 'Tag does not resolve to a commit')
    return object.sha
  }
  let release = pages('releases?per_page=100').find(item => item.tag_name === tag)
  if (!release && mode === 'publish') {
    const existingTag = pages('tags?per_page=100').find(item => item.name === tag)
    if (existingTag) assert.equal(resolveTag(), sha, 'Version already used: bump package.json and package-lock.json in the PR')
    assertCurrent()
    gh('release', 'create', tag, '--repo', repository, '--target', sha,
      '--title', tag, '--generate-notes', '--latest')
    release = api(`releases/tags/${tag}`)
  }
  assert.ok(release, 'A published Release must exist before deployment')
  validateRelease(release, tag, resolveTag(), sha)
  if (mode === 'publish') {
    appendFileSync(process.env.GITHUB_OUTPUT, `tag=${tag}\nsha=${sha}\n`)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Release: ${release.html_url}\n\nVerified commit: ${sha}\n`)
  }
  console.log(`Verified ${tag} at ${sha}`)
}

module.exports = { validatePolicy, releaseTag, validateRelease }
if (require.main === module) run(process.argv[2])
