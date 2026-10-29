// Makes everything that follows the official lists of src/plugins/packs from its one source, commands/manifest.json
// (the lists in order) and the JSON files beside it:
//   - src/plugins/packs/commands/index.ts, which imports them in that order for the app;
//   - server/internal/workspace/packs, the copies the Go backend embeds.
// With --check it changes nothing and fails when any of them is not what it would make (tests/commands.test.cjs).
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const source = path.join(root, 'src/plugins/packs')
const goCopies = path.join(root, 'server/internal/workspace/packs')

function index(names) {
  const imports = names.map((name, i) => `import list${i} from './${name}'`).join('\n')
  const items = names.map((_, i) => `  list${i},`).join('\n')
  return `// Made by scripts/generate-packs.cjs from manifest.json: run \`npm run packs:generate\` after changing the lists.
import { isInputType, type SavedWordList } from '../../../core/wordLists'
${imports}

const commands: SavedWordList[] = [
${items}
].map(list => ({
  ...list,
  words: list.words.map(word => {
    if (!isInputType(word.input_type)) throw new Error('Invalid official input_type')
    return { ...word, input_type: word.input_type }
  }),
}))

export default commands
`
}

/** The files to make, by path, with their contents. */
function outputs() {
  const names = JSON.parse(fs.readFileSync(path.join(source, 'commands/manifest.json'), 'utf8'))
  if (new Set(names).size !== names.length) throw new Error('manifest.json names a list twice')
  const files = new Map([[path.join(source, 'commands/index.ts'), index(names)]])
  for (const name of ['samples.json', 'countries.json']) {
    files.set(path.join(goCopies, name), fs.readFileSync(path.join(source, name), 'utf8'))
  }
  for (const name of ['manifest.json', ...names]) {
    files.set(path.join(goCopies, 'commands', name), fs.readFileSync(path.join(source, 'commands', name), 'utf8'))
  }
  return files
}

/** Copies of lists no longer in the manifest. */
function stale(files) {
  const directory = path.join(goCopies, 'commands')
  return fs.readdirSync(directory).filter(name => name.endsWith('.json')).map(name => path.join(directory, name))
    .filter(file => !files.has(file))
}

function check() {
  const files = outputs()
  const differing = [...files].filter(([file, text]) => !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text)
    .map(([file]) => file).concat(stale(files))
  return differing.map(file => path.relative(root, file))
}

function generate() {
  const files = outputs()
  for (const file of stale(files)) fs.rmSync(file)
  fs.mkdirSync(path.join(goCopies, 'commands'), { recursive: true })
  for (const [file, text] of files) fs.writeFileSync(file, text)
}

if (require.main === module) {
  if (process.argv.includes('--check')) {
    const differing = check()
    if (differing.length) {
      console.error(`Not up to date (run npm run packs:generate):\n${differing.join('\n')}`)
      process.exit(1)
    }
  } else {
    generate()
  }
}

module.exports = { check }
