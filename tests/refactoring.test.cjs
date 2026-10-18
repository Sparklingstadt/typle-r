require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { bestRecords, recentRecords, removeRecord } = require('../src/core/records.ts')

test('record ordering and deletion preserve other lists and legacy records', () => {
  const legacy = { date: '2026-01-01', time: 1 }
  const slow = { id: 'slow', date: '2026-01-02', time: 5, accuracy: 100 }
  const fast = { id: 'fast', date: '2026-01-03', time: 2, accuracy: 100 }
  const records = [legacy, slow, fast]
  const lists = [{ id: 'a', records }, { id: 'b', records: [legacy] }]
  assert.deepEqual(bestRecords(records), [fast, slow, legacy])
  assert.deepEqual(records, [legacy, slow, fast])
  assert.equal(recentRecords(lists)[0].record, fast)
  assert.deepEqual(removeRecord(lists, 'a', legacy)[0].records, [slow, fast])
  assert.equal(removeRecord(lists, 'a', fast)[1], lists[1])
  assert.deepEqual(removeRecord(lists, 'a', fast)[0].records, [legacy, slow])
})
