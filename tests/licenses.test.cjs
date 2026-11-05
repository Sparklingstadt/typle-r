const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { collectLicenses, write } = require('../scripts/generate-licenses.cjs')

const entries = collectLicenses()
const find = name => entries.find(entry => entry.name === name)

test('production packages are listed with their license text', () => {
  const react = find('react')
  assert.equal(react.license, 'MIT')
  assert.match(react.text, /Permission is hereby granted/)
  assert.match(react.url, /^https:\/\//)
})

test('development packages are left out', () => {
  const lock = require('../package-lock.json').packages
  const nameOf = location => location.slice(location.lastIndexOf('node_modules/') + 'node_modules/'.length)
  const shipped = new Set(Object.entries(lock).filter(([location, entry]) => location && !entry.dev && !entry.devOptional).map(([location]) => nameOf(location)))
  const devOnly = Object.entries(lock).filter(([location, entry]) => (entry.dev || entry.devOptional) && !shipped.has(nameOf(location))).map(([location]) => nameOf(location))
  assert.ok(devOnly.includes('eslint') && devOnly.includes('@playwright/test'))
  for (const name of devOnly) assert.equal(find(name), undefined, name)
})

test('onnxruntime-web gets the license text of its repository, as the package has none', () => {
  for (const name of ['onnxruntime-web', 'onnxruntime-common']) {
    const entry = find(name)
    assert.equal(entry.license, 'MIT')
    assert.match(entry.text, /Copyright \(c\) Microsoft Corporation/)
  }
})

test('the font and the handwriting model are listed', () => {
  assert.match(find('Noto Sans JP').text, /SIL Open Font License, Version 1\.1/)
  assert.match(find('PaddleOCR korean_PP-OCRv5_mobile_rec (ONNX)').text, /Apache License/)
})

test('each package is listed once and the list is sorted', () => {
  const keys = entries.map(entry => `${entry.name}@${entry.version}`)
  assert.equal(new Set(keys).size, keys.length)
  const names = entries.map(entry => entry.name)
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'en')))
})

test('write gives the page its list and every text', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'licenses-'))
  write(entries, out)
  const list = JSON.parse(fs.readFileSync(path.join(out, 'third-party.json'), 'utf8'))
  assert.equal(list.length, entries.length)
  assert.deepEqual(Object.keys(list[0]).sort(), ['hasText', 'license', 'name', 'url', 'version'])
  const text = fs.readFileSync(path.join(out, 'third-party.txt'), 'utf8')
  assert.match(text, /\nonnxruntime-web \d/)
  fs.rmSync(out, { recursive: true })
})
