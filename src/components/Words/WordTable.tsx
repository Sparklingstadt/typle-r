import { useTranslations } from 'next-intl'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { SavedWordList } from '@/core/wordLists'

// Two columns at every width: the number, and the text to type with the shown word and the note under it. The shown
// word is left out when it is the same as the text to type. Long words, such as an SQL statement, wrap inside their
// cell instead of widening the table.
export default function WordTable({ list }: { list: SavedWordList }) {
  const t = useTranslations('wordLists.words')
  const editor = useTranslations('wordLists.editor')
  const text = 'whitespace-pre-wrap [overflow-wrap:anywhere]'
  return <Table aria-labelledby="words-title" className="table-fixed">
    <TableHeader>
      <TableRow className="hover:bg-transparent">
        <TableHead className="w-12 pl-4 text-right sm:w-14 sm:pl-6"><span aria-hidden="true">#</span><span className="sr-only">{t('number')}</span></TableHead>
        <TableHead className="pr-4 sm:pr-6">{editor('input')}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {list.words.map((word, index) => <TableRow key={index} className="align-top">
        <TableCell className="py-2.5 pl-4 text-right align-top text-muted-foreground tabular-nums sm:pl-6">{index + 1}</TableCell>
        <TableCell className={`py-2.5 pr-4 align-top sm:pr-6 ${text}`}>
          <span className="font-mono font-medium">{word.input}</span>
          {word.display !== word.input && <p className="mt-1 text-sm">{word.display}</p>}
          {word.annotation && <p className="mt-1 text-[13px] text-muted-foreground">{word.annotation}</p>}
        </TableCell>
      </TableRow>)}
    </TableBody>
  </Table>
}
