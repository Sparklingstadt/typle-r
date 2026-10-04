import type { WordList } from "../core/wordLists"

/** Preserve exact typing strings, including whitespace, quotes and newlines. */
export function encodeWordCsv(words: WordList["words"]) {
  const cell = (value: string) => `"${value.replaceAll('"', '""')}"`
  return "\uFEFFinput,display,annotation\r\n" + words.map(word =>
    [word.input, word.display, word.annotation].map(cell).join(",")
  ).join("\r\n") + "\r\n"
}

export function wordCsvFilename(name: string) {
  const safe = Array.from(name).map(char =>
    char.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(char) ? "_" : char
  ).join("").replace(/^[. ]+|[. ]+$/g, "").slice(0, 80).replace(/[. ]+$/g, "")
  const base = safe || "word-list"
  return `${/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base) ? "_" : ""}${base}.csv`
}
