import type { WordFormat } from "../../core/wordFormat"
import { csvFormat, tsvFormat } from "./delimited"

export { csvFormat, tsvFormat }

const formats: WordFormat[] = [csvFormat, tsvFormat]
const readable = formats.filter(format => format.parse)

/** The format that reads a file with this name, by its extension. */
export function importFormat(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase()
  return readable.find(format => format.extension === extension)
}

/** The extensions a file input accepts, such as `.csv,.tsv`. */
export const importAccept = readable.map(format => `.${format.extension}`).join(",")

/** A file name for the list that every common OS accepts. */
export function wordFilename(name: string, format: WordFormat) {
  const safe = Array.from(name).map(char =>
    char.charCodeAt(0) < 32 || /[<>:"/\\|?*]/.test(char) ? "_" : char
  ).join("").replace(/^[. ]+|[. ]+$/g, "").slice(0, 80).replace(/[. ]+$/g, "")
  const base = safe || "word-list"
  return `${/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base) ? "_" : ""}${base}.${format.extension}`
}
