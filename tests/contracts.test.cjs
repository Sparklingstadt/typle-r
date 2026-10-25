const assert = require('node:assert/strict')
const { test } = require('node:test')
require('./register.cjs')
const fixture = require('./contracts/workspace.json')
const { decodeLists, MAX_CATEGORY, MAX_TAG, MAX_TAGS } = require('../src/core/wordLists.ts')
const { validateWorkspaceRequest } = require('../src/core/workspaceRequest.ts')
const { MAX_LISTS } = require('../src/core/listOverview.ts')

test('the shared contract is accepted by the web decoder without dropping nested fields', () => {
  assert.equal(fixture.version, 1)
  assert.deepEqual({ lists: MAX_LISTS, category: MAX_CATEGORY, tag: MAX_TAG, tags: MAX_TAGS }, fixture.limits)
  assert.deepEqual(decodeLists(JSON.stringify({ version: 1, lists: fixture.saved.lists })), fixture.saved.lists)
  assert.deepEqual(validateWorkspaceRequest(fixture.saved), {
    lists: fixture.saved.lists, devices: fixture.saved.devices, revision: fixture.saved.revision,
  })
})
