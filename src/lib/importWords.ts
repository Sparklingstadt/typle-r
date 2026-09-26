import type { WordList } from "../types/WordList"

export const MAX_IMPORT_BYTES = 1024 * 1024

/** Read CSV and TSV, including escaped quotes and quoted multiline fields. */
export function parseWordFile(source: string, delimiter: "," | "\t"): WordList["words"] {
  if (new TextEncoder().encode(source).length > MAX_IMPORT_BYTES) throw new Error("ファイルは1 MiB以内にしてください。")
  const text = source.replace(/^\uFEFF/, "")
  const rows: { cells: string[]; line: number }[] = []
  let cells: string[] = [], value = "", quoted = false, closed = false, line = 1, start = 1
  const fail = () => { throw new Error(`${line}行目の引用符の形式が正しくありません。`) }
  const field = () => { cells.push(value); value = ""; closed = false }
  const row = () => {
    field()
    if (cells.some(cell => cell.trim())) rows.push({ cells, line: start })
    cells = []
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { value += '"'; i++ }
        else { quoted = false; closed = true }
      } else { value += c; if (c === "\n" || (c === "\r" && text[i + 1] !== "\n")) line++ }
    } else if (c === delimiter) field()
    else if (c === "\r" || c === "\n") {
      row()
      if (c === "\r" && text[i + 1] === "\n") i++
      line++; start = line
    } else if (closed) fail()
    else if (c === '"') { if (value) fail(); quoted = true }
    else value += c
  }
  if (quoted) fail()
  row()
  const header = rows.shift()?.cells.map(cell => cell.trim()) ?? []
  if (!header.includes("input") || !header.includes("display")) throw new Error("見出しに input と display が必要です。annotation は省略できます。")
  if (new Set(header).size !== header.length) throw new Error("見出しのカラム名が重複しています。")
  if (header.some(name => !["input", "display", "annotation"].includes(name))) throw new Error("カラム名は input、display、annotation を使用してください。")
  if (!rows.length) throw new Error("単語を1行以上追加してください。")
  if (rows.length > 1000) throw new Error("単語は1リストにつき1,000件までです。")
  return rows.map(({ cells, line }) => {
    if (cells.length !== header.length) throw new Error(`${line}行目のカラム数が見出しと一致しません。`)
    const get = (name: string) => (cells[header.indexOf(name)] ?? "").trim()
    const word = { input: get("input"), display: get("display"), annotation: get("annotation") }
    if (!word.input || !word.display) throw new Error(`${line}行目の input と display は必須です。`)
    if (word.input.length > 1000 || word.display.length > 1000 || word.annotation.length > 2000) throw new Error(`${line}行目が文字数の上限を超えています（input・display: 1,000文字、annotation: 2,000文字）。`)
    return word
  })
}
