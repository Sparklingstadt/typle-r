import type { PracticeDevice } from "../lib/devices"

export type WordList = {
  id?: string,
  name: string,
  words: {
    display: string,
    input: string,
    annotation: string
  }[],
  records: {
    id?: string,
    time: number,
    date: string,
    mistakes?: number,
    accuracy?: number,
    device?: PracticeDevice,
    wordCount?: number
  }[],
  createdAt: string
}
