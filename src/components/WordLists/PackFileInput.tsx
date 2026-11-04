"use client"
import { useRef } from "react"
import { useTranslations } from "next-intl"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"

// A hidden file input and the button that opens it, for importing a pack file.
export default function PackFileInput({ disabled, className, onFile }: { disabled: boolean; className?: string; onFile: (file: File) => void }) {
  const t = useTranslations('wordLists')
  const fileInput = useRef<HTMLInputElement>(null)
  return <>
    <input ref={fileInput} type="file" accept=".json,application/json" hidden tabIndex={-1} aria-hidden="true"
      onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onFile(file) }} />
    <Button variant="outline" className={className} disabled={disabled} onClick={() => fileInput.current?.click()}><Upload aria-hidden="true" />{t('manager.importFile')}</Button>
  </>
}
