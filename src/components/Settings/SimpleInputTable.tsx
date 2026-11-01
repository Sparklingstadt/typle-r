import { useTranslations } from 'next-intl'
import { cyrillicLatin, latinBase } from '@/core/typing'

// Marked letters of the languages the packs cover. Any marked Latin letter folds the same way; letters without a plain
// base (ł, ø, đ) are left out by latinBase, so the table only shows what practice accepts.
const markedLetters = 'àáâãäåāăąǎçćĉċčďèéêëēĕėęěĝğġģĥìíîïĩīĭįıĵķĺļľńņňñòóôõöōŏőǒŕŗřśŝşšșţťțùúûüũūŭůűųǔŵýÿŷźżž'

function markedGroups() {
  const groups = new Map<string, string[]>()
  for (const char of Array.from(markedLetters)) {
    const base = latinBase(char)
    if (!base || base === char) continue
    groups.set(base, [...(groups.get(base) ?? []), char])
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b))
}

function Key({ children }: { children: string }) {
  return <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{children}</kbd>
}

export default function SimpleInputTable() {
  const t = useTranslations('input.simpleTable')
  const head = 'border-b bg-muted/50 text-xs text-muted-foreground'
  const cell = 'px-4 py-2'

  return <section aria-labelledby="simple-table-heading" className="rounded-xl border bg-card p-4 sm:p-5">
    <div className="space-y-1">
      <h2 id="simple-table-heading" className="font-bold">{t('heading')}</h2>
      <p className="text-sm text-muted-foreground">{t('description')}</p>
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <caption className="border-b px-4 py-2 text-left font-medium">{t('latin')}</caption>
            <thead className={head}>
              <tr>
                <th scope="col" className={`${cell} font-medium`}>{t('letter')}</th>
                <th scope="col" className={`${cell} font-medium`}>{t('key')}</th>
              </tr>
            </thead>
            <tbody>
              {markedGroups().map(([base, letters]) => <tr key={base} className="border-b last:border-0">
                <td className={`${cell} text-base tracking-wide`} lang="und">{letters.join(' ')}</td>
                <td className={cell}><Key>{base}</Key></td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <caption className="border-b px-4 py-2 text-left font-medium">{t('other')}</caption>
            <thead className={head}>
              <tr>
                <th scope="col" className={`${cell} font-medium`}>{t('letter')}</th>
                <th scope="col" className={`${cell} font-medium`}>{t('key')}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className={`${cell} text-base`} lang="de">ß</td>
                <td className={cell}><Key>ss</Key></td>
              </tr>
              <tr>
                <td className={`${cell} text-base`} lang="es">¿</td>
                <td className={cell}><Key>?</Key></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border self-start">
        <table className="w-full text-left text-sm">
          <caption className="border-b px-4 py-2 text-left font-medium">{t('cyrillic')}</caption>
          <thead className={head}>
            <tr>
              <th scope="col" className={`${cell} font-medium`}>{t('letter')}</th>
              <th scope="col" className={`${cell} font-medium`}>{t('key')}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(cyrillicLatin).map(([letter, latin]) => <tr key={letter} className="border-b last:border-0">
              <td className={`${cell} text-base`} lang="ru">{letter}</td>
              <td className={cell}><Key>{latin}</Key></td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>
    <p className="mt-3 text-[13px] text-muted-foreground">{t('capitals')}</p>
  </section>
}
