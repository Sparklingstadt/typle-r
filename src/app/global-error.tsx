'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => { Sentry.captureException(error) }, [error])

  return (
    <html lang="ja">
      <body>
        <main style={{ maxWidth: 560, margin: '15vh auto', padding: 24, fontFamily: 'sans-serif' }}>
          <h1>画面を表示できませんでした</h1>
          <p>しばらくしてから、もう一度お試しください。</p>
          <button onClick={() => window.location.reload()}>再読み込み</button>
        </main>
      </body>
    </html>
  )
}
