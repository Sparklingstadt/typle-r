require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const limits = require('./fixtures/limits.json')

// The same table is read by server/internal/workspace/limits_test.go, so a limit cannot change on one side only.
test('the limits are the ones the backend checks', () => {
  const app = { ...require('../src/core/devices.ts'), ...require('../src/core/interests.ts'), ...require('../src/core/listOverview.ts'),
    ...require('../src/core/records.ts'), ...require('../src/core/wordDraft.ts'), ...require('../src/core/wordFormat.ts'),
    ...require('../src/core/wordLists.ts'), ...require('../src/core/wordPacks.ts') }
  assert.deepEqual(Object.fromEntries(Object.keys(limits).map(name => [name, app[name]])), limits)
})
