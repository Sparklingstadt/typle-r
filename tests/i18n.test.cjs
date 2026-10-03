const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { parse, TYPE } = require('@formatjs/icu-messageformat-parser')

const messages = path.join(__dirname, '../src/messages')
const locales = ['ja', 'en', 'zh-CN', 'zh-TW', 'ru', 'fr']
const namespaces = fs.readdirSync(path.join(messages, 'ja')).filter(file => file.endsWith('.json'))

function flatten(value, prefix = '', out = {}) {
  for (const [key, child] of Object.entries(value)) {
    const name = prefix ? `${prefix}.${key}` : key
    if (child && typeof child === 'object') flatten(child, name, out)
    else out[name] = child
  }
  return out
}

// The placeholders and rich-text tags a message uses, so every language receives the same values.
function argumentsOf(elements, out = new Set()) {
  for (const element of elements) {
    if (element.type === TYPE.argument || element.type === TYPE.number || element.type === TYPE.date || element.type === TYPE.time) out.add(element.value)
    if (element.type === TYPE.plural || element.type === TYPE.select) {
      out.add(element.value)
      for (const option of Object.values(element.options)) argumentsOf(option.value, out)
    }
    if (element.type === TYPE.tag) { out.add(`<${element.value}>`); argumentsOf(element.children, out) }
  }
  return out
}

const read = (locale, file) => flatten(JSON.parse(fs.readFileSync(path.join(messages, locale, file), 'utf8')))

test('every language has the same message files and keys as Japanese', () => {
  for (const locale of locales) {
    assert.deepEqual(fs.readdirSync(path.join(messages, locale)).sort(), fs.readdirSync(path.join(messages, 'ja')).sort(), locale)
    for (const file of namespaces) assert.deepEqual(Object.keys(read(locale, file)).sort(), Object.keys(read('ja', file)).sort(), `${locale}/${file}`)
  }
})

// messages.ts loads the areas listed by the message type, so a new file must be added to messageTypes.ts too.
test('every message file is part of the message type', () => {
  const types = fs.readFileSync(path.join(__dirname, '../src/i18n/messageTypes.ts'), 'utf8')
  const listed = [...types.matchAll(/from '@\/messages\/ja\/(\w+)\.json'/g)].map(match => `${match[1]}.json`)
  assert.deepEqual(listed.sort(), [...namespaces].sort())
})

test('messages are valid ICU and use the same placeholders in every language', () => {
  for (const file of namespaces) {
    const base = read('ja', file)
    for (const locale of locales) {
      for (const [key, value] of Object.entries(read(locale, file))) {
        const where = `${locale}/${file} ${key}`
        assert.equal(typeof value, 'string', where)
        assert.ok(value.trim(), `${where} is empty`)
        const args = [...argumentsOf(parse(value))].sort()
        assert.deepEqual(args, [...argumentsOf(parse(base[key]))].sort(), where)
      }
    }
  }
})

// Screen text belongs in src/messages. Comments and the sample word lists (src/json) may still be Japanese, and a
// literal that is data rather than screen text (a stored name, a language's own name) is marked `// i18n-ignore`.

test('source files have no hard-coded Japanese text', () => {
  const japanese = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u
  const found = []
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      const relative = path.relative(path.join(__dirname, '..'), file).split(path.sep).join('/')
      if (entry.isDirectory()) { if (relative !== 'src/messages' && relative !== 'src/json') walk(file); continue }
      if (!/\.tsx?$/.test(entry.name)) continue
      const text = fs.readFileSync(file, 'utf8')
      const lines = text.split('\n')
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
      const visit = node => {
        if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) && japanese.test(node.text)) {
          const line = source.getLineAndCharacterOfPosition(node.getStart()).line
          if (!lines[line].includes('// i18n-ignore')) found.push(`${relative}:${line + 1} ${node.text.trim().slice(0, 40)}`)
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
  }
  walk(path.join(__dirname, '../src'))
  assert.deepEqual(found, [])
})
