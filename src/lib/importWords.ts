import { AppError } from "./appError"
import type { WordList } from "../types/WordList"

export const MAX_IMPORT_BYTES = 1024 * 1024

/** Read CSV and TSV, including escaped quotes and quoted multiline fields. */
export function parseWordFile(source: string, delimiter: "," | "\t"): WordList["words"] {
  if (new TextEncoder().encode(source).length > MAX_IMPORT_BYTES) throw new AppError('importTooLarge')
  const text = source.replace(/^\uFEFF/, "")
  const rows: { cells: string[]; line: number }[] = []
  let cells: string[] = [], value = "", quoted = false, closed = false, line = 1, start = 1
  const fail = () => { throw new AppError('importQuote', { line }) }
  const field = () => { cells.push(value); value = ""; closed = false }
  const row = () => {
    const explicit = closed
    field()
    if (cells.length > 1 || cells.some(cell => cell.trim()) || explicit) rows.push({ cells, line: start })
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
  const header = rows.shift()?.cells.map(cell => cell.trim() === "anotation" ? "annotation" : cell.trim()) ?? []
  if (!header.includes("input") || !header.includes("display")) throw new AppError('importHeaderRequired')
  if (new Set(header).size !== header.length) throw new AppError('importHeaderDuplicate')
  if (header.some(name => !["input", "display", "annotation"].includes(name))) throw new AppError('importHeaderUnknown')
  if (!rows.length) throw new AppError('importNoRows')
  if (rows.length > 1000) throw new AppError('importTooManyRows')
  return rows.map(({ cells, line }) => {
    if (cells.length !== header.length) throw new AppError('importColumnCount', { line })
    const get = (name: string) => (cells[header.indexOf(name)] ?? "")
    const word = { input: get("input"), display: get("display"), annotation: get("annotation") }
    if (!word.input.trim() || !word.display.trim()) throw new AppError('importFieldRequired', { line })
    if (word.input.length > 1000 || word.display.length > 1000 || word.annotation.length > 2000) throw new AppError('importFieldTooLong', { line })
    return word
  })
}
