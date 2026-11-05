import { useTranslations } from 'next-intl'
import { RadioGroup } from 'radix-ui'
import type { RankOrder } from '@/core/records'

export default function OrderToggle({ value, onChange }: { value: RankOrder; onChange: (value: RankOrder) => void }) {
  const t = useTranslations('rankings.order')
  return <RadioGroup.Root value={value} onValueChange={next => onChange(next as RankOrder)} aria-label={t('label')} orientation="horizontal"
    className="inline-flex h-9 items-center rounded-full border bg-muted/60 p-0.5 text-[13px]">
    {(['accuracy', 'speed'] as const).map(option =>
      <RadioGroup.Item key={option} value={option}
        className="h-full rounded-full px-3 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=checked]:bg-background data-[state=checked]:font-medium data-[state=checked]:text-foreground data-[state=checked]:shadow-sm dark:data-[state=checked]:bg-input">
        {t.rich(option, { wide: chunks => <span className="hidden sm:inline">{chunks}</span> })}
      </RadioGroup.Item>)}
  </RadioGroup.Root>
}
