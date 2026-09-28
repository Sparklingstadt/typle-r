const { test } = require('node:test')
const assert = require('node:assert/strict')
const { validatePolicy, releaseTag, validateRelease } = require('./release.cjs')

function validPolicy() {
  return {
    event: { ref: 'refs/heads/main', after: 'new', before: 'old', forced: false },
    sha: 'new', parentLine: 'new old', commits: '1', repository: 'Sparklingstadt/typle-r',
    repo: { allow_squash_merge: true, allow_merge_commit: false, allow_rebase_merge: false },
    prs: [{ merged_at: '2026-09-29', merge_commit_sha: 'new', base: { ref: 'main', repo: { full_name: 'Sparklingstadt/typle-r' } } }],
  }
}

test('accepts a squash commit associated with a merged PR', () => {
  assert.doesNotThrow(() => validatePolicy(validPolicy()))
})
for (const [name, change] of [
  ['direct push without a merged PR', p => { p.prs = [] }],
  ['ordinary merge commit', p => { p.parentLine = 'new old branch' }],
  ['multi-commit push', p => { p.commits = '2' }],
  ['force push', p => { p.event.forced = true }],
  ['rebase merge remains enabled', p => { p.repo.allow_rebase_merge = true }],
  ['ordinary merge remains enabled', p => { p.repo.allow_merge_commit = true }],
  ['unmerged PR', p => { p.prs[0].merged_at = null }],
  ['PR for a different commit', p => { p.prs[0].merge_commit_sha = 'other' }],
  ['PR for another base branch', p => { p.prs[0].base.ref = 'dev' }],
]) {
  test(`blocks ${name}`, () => {
    const policy = validPolicy()
    change(policy)
    assert.throws(() => validatePolicy(policy))
  })
}
test('requires stable release versions', () => {
  assert.equal(releaseTag('0.19.0'), 'v0.19.0')
  for (const version of ['v1.0.0', '1.0.0-beta.1', '01.0.0', '1.0', '1.0.0\nunsafe']) {
    assert.throws(() => releaseTag(version))
  }
})
test('allows retry of the same published release but rejects wrong SHA or unpublished releases', () => {
  const release = { tag_name: 'v0.19.0', draft: false, prerelease: false }
  assert.doesNotThrow(() => validateRelease(release, 'v0.19.0', 'same', 'same'))
  assert.throws(() => validateRelease(release, 'v0.19.0', 'old', 'new'))
  assert.throws(() => validateRelease({ ...release, draft: true }, 'v0.19.0', 'same', 'same'))
  assert.throws(() => validateRelease({ ...release, prerelease: true }, 'v0.19.0', 'same', 'same'))
})
