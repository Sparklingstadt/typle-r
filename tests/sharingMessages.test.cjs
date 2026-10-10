const { test } = require('node:test')
const assert = require('node:assert/strict')

// The delete confirmation appends sharedNote to another sentence, so languages that separate sentences with a space need one.
test('the shared note reads as its own sentence after the delete description', () => {
  for (const locale of ['en', 'fr', 'ru']) {
    const { delete: messages } = require(`../src/messages/${locale}/wordLists.json`)
    for (const description of [messages.listOnly, messages.withRecords]) {
      assert.match(`${description}${messages.sharedNote}`, /[.!?。] \S/, `${locale}: ${description}${messages.sharedNote}`)
    }
  }
})
