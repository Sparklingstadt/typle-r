const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

// A review gate, alongside behavioral tests: a newly added route or an unexercised validation change must still be
// noticed. Updating a hash acknowledges review; it does not demonstrate compatibility or copy an implementation.
function sourceFiles(root, groups) {
  return groups.flatMap(group => {
    function walk(relative) {
      return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap(entry => {
        const filename = path.posix.join(relative, entry.name)
        if (entry.isDirectory()) return walk(filename)
        return entry.isFile() && filename.endsWith(group.extension) && !filename.endsWith('_test.go') ? [filename] : []
      })
    }
    return walk(group.directory)
  }).sort()
}
function checkUpstream(root, manifest) {
  const expected = Object.keys(manifest.files).sort()
  const actual = [...sourceFiles(root, manifest.groups), ...manifest.extraFiles].sort()
  const instruction = 'Review the upstream change, run the common contract/matrix tests, then update the reviewed hashes.'
  assert.deepEqual(actual, expected, `upstream source files were added or removed. ${instruction}`)
  for (const filename of actual) {
    const digest = createHash('sha256').update(fs.readFileSync(path.join(root, filename))).digest('hex')
    assert.equal(digest, manifest.files[filename], `${filename} changed after ${manifest.reviewedCommit}. ${instruction}`)
  }
  return actual.length
}
module.exports = { checkUpstream, sourceFiles }
