require('./register.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { inkBounds, inkLayout, lineTensor, recognitionClasses, readBestPath, textLogProbability, readHandwriting, LINE_HEIGHT, ACCEPT_MARGIN } = require('../src/core/handwriting.ts')

// A model output from per-step class probabilities given as { class: probability }, the rest spread evenly.
function output(steps, classes) {
  const probabilities = new Float32Array(steps.length * classes)
  steps.forEach((step, t) => {
    const named = Object.values(step).reduce((sum, p) => sum + p, 0)
    const rest = (1 - named) / (classes - Object.keys(step).length)
    for (let c = 0; c < classes; c++) probabilities[t * classes + c] = step[c] ?? rest
  })
  return { probabilities, steps: steps.length, classes }
}

const classes = recognitionClasses('가\n나\n다\n')
// '' (blank) 가 나 다 ' '
const [, GA, NA, DA, SPACE] = [0, 1, 2, 3, 4]

test('recognitionClasses puts the blank first and a space last', () => {
  assert.deepEqual(classes, ['', '가', '나', '다', ' '])
  assert.deepEqual(recognitionClasses('\n가\r\n나'), ['', '가', '나', ' '])
})

test('the dictionary of the Korean model matches its classes', () => {
  const dictionary = fs.readFileSync(path.join(__dirname, '../public/handwriting/ko/ppocrv5_korean_dict.txt'), 'utf8')
  // The model's output has 11947 classes.
  assert.equal(recognitionClasses(dictionary).length, 11947)
})

test('inkBounds and inkLayout fit the strokes into the line', () => {
  assert.equal(inkBounds([]), null)
  const bounds = inkBounds([[{ x: 10, y: 20 }, { x: 110, y: 70 }], [{ x: 50, y: 40 }]])
  assert.deepEqual(bounds, { x: 10, y: 20, width: 100, height: 50 })
  const layout = inkLayout(bounds, 0)
  assert.equal(layout.scale, (LINE_HEIGHT - 8) / 50)
  assert.deepEqual(layout.map({ x: 10, y: 20 }), { x: 4, y: 4 })
  assert.equal(layout.width, Math.max(Math.ceil(100 * layout.scale) + 8, 2 * LINE_HEIGHT))
})

test('a flat stroke is not stretched to the line height and sits in the middle', () => {
  const layout = inkLayout({ x: 0, y: 30, width: 100, height: 2 }, 50)
  assert.equal(layout.scale, (LINE_HEIGHT - 8) / 50)
  assert.equal(layout.map({ x: 0, y: 31 }).y, LINE_HEIGHT / 2)
})

test('lineTensor takes BGR planes scaled to -1…1', () => {
  // Two pixels: pure red, then white.
  const data = lineTensor([255, 0, 0, 255, 255, 255, 255, 255, ...Array((LINE_HEIGHT - 2) * 4).fill(0)], 1)
  // A line 1 pixel wide; only the first two pixels are checked.
  assert.equal(data.length, 3 * LINE_HEIGHT * 1)
  const size = LINE_HEIGHT
  assert.equal(data[0], -1) // B of red
  assert.equal(data[2 * size], 1) // R of red
  assert.equal(data[1], 1) // B of white
})

test('readBestPath drops repeats and blanks', () => {
  const out = output([{ [GA]: 0.9 }, { [GA]: 0.9 }, { 0: 0.9 }, { [GA]: 0.9 }, { [NA]: 0.9 }], classes.length)
  assert.equal(readBestPath(out, classes).text, '가가나')
})

test('textLogProbability is highest for the best path and -Infinity for unknown characters', () => {
  const out = output([{ [GA]: 0.8 }, { 0: 0.8 }, { [NA]: 0.8 }], classes.length)
  const best = textLogProbability(out, classes, '가나')
  assert.ok(best > textLogProbability(out, classes, '가다'))
  assert.ok(best > textLogProbability(out, classes, '가'))
  assert.equal(textLogProbability(out, classes, '가x'), -Infinity)
  // Every path to 가나 counts, so the text is at least as likely as its best path.
  assert.ok(best >= readBestPath(out, classes).logProbability)
})

test('readHandwriting settles on the expected word only when the model finds it nearly as likely', () => {
  // 나 is read, with 다 a close second at the last step.
  const close = output([{ [GA]: 0.9 }, { 0: 0.9 }, { [NA]: 0.5, [DA]: 0.45 }], classes.length)
  assert.deepEqual(readHandwriting(close, classes), { text: '가나', accepted: false })
  assert.deepEqual(readHandwriting(close, classes, '가다'), { text: '가다', accepted: true })
  // 다 far behind: the reading stays.
  const far = output([{ [GA]: 0.9 }, { 0: 0.9 }, { [NA]: 0.98, [DA]: 0.0001 }], classes.length)
  assert.ok(Math.log(0.98) - Math.log(0.0001) > ACCEPT_MARGIN)
  assert.deepEqual(readHandwriting(far, classes, '가다'), { text: '가나', accepted: false })
})

test('readHandwriting does not mind the gaps between words', () => {
  const out = output([{ [GA]: 0.9 }, { [SPACE]: 0.9 }, { [NA]: 0.9 }], classes.length)
  assert.equal(readBestPath(out, classes).text, '가 나')
  assert.deepEqual(readHandwriting(out, classes, '가나'), { text: '가나', accepted: true })
  const joined = output([{ [GA]: 0.9 }, { 0: 0.9 }, { [NA]: 0.9 }], classes.length)
  assert.deepEqual(readHandwriting(joined, classes, '가 나'), { text: '가 나', accepted: true })
})
