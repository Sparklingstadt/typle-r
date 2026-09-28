import type { ReactNode } from 'react'

/** Layout for the word list editor; on mobile its sticky action bar spans this padding. */
export default function WordListEditorPage({ children }: { children: ReactNode }) {
  return <main className="mx-auto w-full max-w-5xl px-4 pt-8 sm:px-6 lg:px-8">{children}</main>
}
