#!/usr/bin/env node
// Builds and checks typle word lists with the app's own code (src/core, src/plugins/formats), so a file that passes
// here is read by the app the same way. Run from the repository root:
//
//   node .claude/skills/new-word-list/scripts/word-list.cjs csv  <words.json> <out.csv>
//   node .claude/skills/new-word-list/scripts/word-list.cjs pack <pack.json>  <out.typle-pack.json>
//   node .claude/skills/new-word-list/scripts/word-list.cjs check <file>...
//
// words.json is an array of { display, input?, annotation?, input_type? } (input defaults to display, annotation to "").
// pack.json is a PackFile without format/version: { pack: { name, ... }, lists: [{ name, levels?, words }] }.
// check reads .csv/.tsv (import), .typle-pack.json (pack import) and src/plugins/packs/commands/*.json (official list).
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../../../..')
require(path.join(root, 'tests/register.cjs'))
const { csvFormat, tsvFormat } = require(path.join(root, 'src/plugins/formats/delimited.ts'))
const { decodePackFile, importPackFile } = require(path.join(root, 'src/core/packFile.ts'))
const { validateList, isInputType } = require(path.join(root, 'src/core/wordLists.ts'))
const errors = require(path.join(root, 'src/messages/ja/errors.json'))

/** The app's Japanese message for an AppError, with its values filled in. */
const describe = error => error && error.key && errors[error.key]
  ? errors[error.key].replace(/\{(\w+)\}/g, (_, name) => error.values?.[name] ?? `{${name}}`) + ` (${error.key})`
  : String(error instanceof Error ? error.message : error)

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))

function normalizeWords(words, where) {
  if (!Array.isArray(words)) throw new Error(`${where}: words は配列にしてください`)
  return words.map((word, i) => {
    if (!word || typeof word.display !== 'string') throw new Error(`${where}: ${i + 1}語目に display がありません`)
    const input = typeof word.input === 'string' && word.input !== '' ? word.input : word.display
    const inputType = word.input_type ?? 'word'
    if (!isInputType(inputType)) throw new Error(`${where}: ${i + 1}語目の input_type は word・command・code のどれかにしてください`)
    return { input, display: word.display, annotation: word.annotation ?? '', input_type: inputType }
  })
}

/** Problems that the app accepts but that make a list worse to practice. */
function warnings(words, where) {
  const notes = []
  const seen = new Map()
  words.forEach((word, i) => {
    const n = `${where} ${i + 1}語目（${word.display}）`
    if (seen.has(word.input)) notes.push(`${n}: input が ${seen.get(word.input)}語目と重複しています`)
    else seen.set(word.input, i + 1)
    if (/[\n\t]/.test(word.input)) notes.push(`${n}: input に改行かタブがあります（入力欄は1行です）`)
    if (word.input !== word.input.trim()) notes.push(`${n}: input の前後に空白があります`)
    if (!word.annotation.trim()) notes.push(`${n}: annotation が空です`)
  })
  if (words.length > 40) notes.push(`${where}: ${words.length}語あります。40語を超えるときは初級・中級・上級などに分けることを検討してください`)
  return notes
}

function checkDelimited(file) {
  const format = file.toLowerCase().endsWith('.tsv') ? tsvFormat : csvFormat
  const words = format.parse(fs.readFileSync(file, 'utf8'))
  return { summary: `${words.length}語`, notes: warnings(words.map(word => ({ ...word, annotation: word.annotation ?? '' })), path.basename(file)) }
}

function checkPack(file) {
  const decoded = decodePackFile(fs.readFileSync(file, 'utf8'))
  const ids = { pack: 'check-pack', lists: decoded.lists.map((_, i) => `check-list-${i}`) }
  const library = importPackFile({ packs: [], lists: [] }, decoded, ids)
  const notes = decoded.lists.flatMap(list => warnings(list.words, `「${list.name}」`))
  return { summary: `パック「${library.packs[0].name}」・${library.lists.length}リスト・${library.lists.reduce((n, l) => n + l.words.length, 0)}語`, notes }
}

function checkOfficial(file) {
  const list = readJson(file)
  const name = path.basename(file)
  const problems = []
  for (const key of ['id', 'name', 'category']) if (typeof list[key] !== 'string' || !list[key].trim()) problems.push(`${key} がありません`)
  if (!Array.isArray(list.tags) || !list.tags.length) problems.push('tags がありません')
  if (list.group !== undefined && (!Array.isArray(list.levels) || list.levels.length !== 1)) problems.push('group があるリストは levels を1つにしてください')
  if (!Array.isArray(list.records) || list.records.length) problems.push('records は空の配列 [] にしてください')
  if (typeof list.createdAt !== 'string' || !Number.isFinite(Date.parse(list.createdAt))) problems.push('createdAt に日時（例: 2026-10-29T00:00:00.000Z）を書いてください')
  if ('packId' in list || 'origin' in list) problems.push('packId・origin は書かないでください（group からパックが作られます）')
  if (!Array.isArray(list.words)) problems.push('words がありません')
  else list.words.forEach((word, i) => {
    if (!isInputType(word.input_type)) problems.push(`${i + 1}語目の input_type は word・command・code のどれかにしてください`)
  })
  if (!problems.length) {
    try { validateList({ ...list, records: [], createdAt: new Date().toISOString() }) } catch (error) { problems.push(describe(error)) }
  }
  const manifest = readJson(path.join(root, 'src/plugins/packs/commands/manifest.json'))
  const notes = Array.isArray(list.words) ? warnings(list.words, name) : []
  if (list.id !== name.replace(/\.json$/, '')) notes.push(`id（${list.id}）がファイル名と違います。新しいリストはファイル名と同じ id にしてください`)
  if (!manifest.includes(name)) notes.push(`${name} は manifest.json にまだありません`)
  if (problems.length) throw new Error(problems.join('\n'))
  return { summary: `「${list.name}」・${list.words.length}語`, notes }
}

function check(files) {
  let failed = false
  for (const file of files.filter(file => path.basename(file) !== 'manifest.json')) {
    try {
      const lower = file.toLowerCase()
      const result = lower.endsWith('.typle-pack.json') ? checkPack(file)
        : lower.endsWith('.json') ? checkOfficial(file)
        : checkDelimited(file)
      console.log(`OK  ${file}: ${result.summary}`)
      for (const note of result.notes) console.log(`  注意: ${note}`)
    } catch (error) {
      failed = true
      console.log(`NG  ${file}:\n  ${describe(error).replace(/\n/g, '\n  ')}`)
    }
  }
  process.exit(failed ? 1 : 0)
}

function main([command, ...args]) {
  if (command === 'check' && args.length) return check(args)
  if (command === 'csv' && args.length === 2) {
    const words = normalizeWords(readJson(args[0]), args[0])
    fs.writeFileSync(args[1], csvFormat.encode(words))
    return check([args[1]])
  }
  if (command === 'pack' && args.length === 2) {
    const source = readJson(args[0])
    const file = {
      format: 'typle-pack', version: 1, pack: source.pack,
      lists: (source.lists ?? []).map(list => ({ name: list.name, ...(list.levels ? { levels: list.levels } : {}), words: normalizeWords(list.words, list.name) })),
    }
    fs.writeFileSync(args[1], JSON.stringify(file, null, 2) + '\n')
    return check([args[1]])
  }
  console.error('使い方: word-list.cjs csv <words.json> <out.csv> | pack <pack.json> <out.typle-pack.json> | check <file>...')
  process.exit(2)
}

main(process.argv.slice(2))
