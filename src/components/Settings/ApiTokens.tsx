"use client"
import { Fragment, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Check, CircleAlert, Copy, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import TextField from '@/components/ui/TextField'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { DEFAULT_TOKEN_LIFETIME, MAX_TOKEN_NAME, MAX_TOKENS, TOKEN_LIFETIMES, type TokenLifetime, type TokenScope, type TokenSummary } from '@/core/apiTokens'
import { useErrorText } from '@/i18n/useErrorText'
import { useFormat } from '@/i18n/useFormat'
import { createToken, listTokens, revokeToken } from '@/lib/apiTokens'

const scopes: TokenScope[] = ['read', 'write']
const radioCard = 'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50'

// Dates the server sent are only checked to be text, so an unreadable one is left out instead of shown as "Invalid Date".
function parseDate(value: string | null) {
  const date = value === null ? null : new Date(value)
  return date && !Number.isNaN(date.getTime()) ? date : null
}

function IssueDialog({ open, onOpenChange, onIssued }: { open: boolean; onOpenChange: (open: boolean) => void; onIssued: (token: TokenSummary) => void }) {
  const t = useTranslations('settings.apiTokens')
  const errors = useTranslations('errors')
  const errorText = useErrorText()
  const form = useTranslations('common.form')
  const id = useId()
  const secretInput = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [scope, setScope] = useState<TokenScope>('read')
  const [lifetime, setLifetime] = useState<TokenLifetime>(DEFAULT_TOKEN_LIFETIME)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [secret, setSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  function close(value: boolean) {
    if (busy && !value) return
    onOpenChange(value)
    if (!value) { setName(''); setScope('read'); setLifetime(DEFAULT_TOKEN_LIFETIME); setError(''); setSecret(null); setCopied(false) }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const issued = await createToken({ name: name.trim(), scope, expiresIn: lifetime })
      setSecret(issued.secret)
      onIssued(issued.token)
    } catch (reason) { setError(errorText(reason, errors('workspaceRequestFailed'))) }
    finally { setBusy(false) }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(secret ?? ''); setCopied(true) }
    catch { secretInput.current?.select() }
  }

  const lifetimeLabel = (value: TokenLifetime) => value === null ? t('never') : value === 365 ? t('year') : t('days', { count: value })

  // While the secret is shown, only the buttons close the dialog, so it is not lost by a stray click or key.
  const keepSecret = (event: Event) => { if (secret !== null) event.preventDefault() }

  return <Dialog open={open} onOpenChange={close}>
    <DialogContent aria-describedby={secret === null ? undefined : `${id}-note`} onInteractOutside={keepSecret} onEscapeKeyDown={keepSecret}>
      <DialogHeader>
        <DialogTitle>{secret === null ? t('createTitle') : t('issued')}</DialogTitle>
        {secret !== null && <DialogDescription id={`${id}-note`}>{t('secretNote')}</DialogDescription>}
      </DialogHeader>
      {secret === null ? <form onSubmit={submit} className="grid gap-4">
        <TextField label={t('name')} value={name} onChange={event => setName(event.target.value)} placeholder={t('namePlaceholder')}
          maxLength={MAX_TOKEN_NAME} required autoComplete="off" />
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">{t('scope')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {scopes.map(value => <label key={value} className={radioCard}>
              <input type="radio" name={`${id}-scope`} checked={scope === value} onChange={() => setScope(value)} className="size-4 accent-primary" />
              {t(value === 'read' ? 'scopeRead' : 'scopeWrite')}
            </label>)}
          </div>
        </fieldset>
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">{t('lifetime')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {TOKEN_LIFETIMES.map(value => <label key={String(value)} className={radioCard}>
              <input type="radio" name={`${id}-lifetime`} checked={lifetime === value} onChange={() => setLifetime(value)} className="size-4 accent-primary" />
              {lifetimeLabel(value)}
            </label>)}
          </div>
        </fieldset>
        {error && <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive"><CircleAlert className="size-4 shrink-0" aria-hidden="true" />{error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={busy} onClick={() => close(false)}>{form('cancel')}</Button>
          <Button type="submit" disabled={busy || !name.trim()}>{t('issue')}</Button>
        </div>
      </form> : <div className="grid gap-4">
        <div className="flex gap-2">
          <input ref={secretInput} readOnly value={secret} aria-label={t('issued')} onFocus={event => event.currentTarget.select()}
            className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-muted/40 px-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
          <Button variant="outline" size="lg" onClick={copy}>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? t('copied') : t('copy')}
          </Button>
        </div>
        <div className="flex justify-end"><Button onClick={() => close(false)}>{t('done')}</Button></div>
      </div>}
    </DialogContent>
  </Dialog>
}

function RevokeDialog({ token, onClose, onRevoked }: { token: TokenSummary | null; onClose: () => void; onRevoked: (id: string) => void }) {
  const t = useTranslations('settings.apiTokens')
  const errors = useTranslations('errors')
  const errorText = useErrorText()
  const form = useTranslations('common.form')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function revoke() {
    if (!token || busy) return
    setBusy(true)
    setError('')
    try { await revokeToken(token.id); onRevoked(token.id) }
    catch (reason) { setError(errorText(reason, errors('workspaceRequestFailed'))) }
    finally { setBusy(false) }
  }

  return <AlertDialog open={!!token} onOpenChange={value => { if (!value && !busy) { setError(''); onClose() } }}>
    {token && <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle className="[overflow-wrap:anywhere]">{t('revokeTitle', { name: token.name })}</AlertDialogTitle>
        <AlertDialogDescription>{t('revokeNote')}</AlertDialogDescription>
      </AlertDialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy}>{form('cancel')}</AlertDialogCancel>
        <AlertDialogAction variant="destructive" disabled={busy} onClick={event => { event.preventDefault(); void revoke() }}>{t('revokeConfirm')}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>}
  </AlertDialog>
}

function TokenRow({ token, now, onRevoke }: { token: TokenSummary; now: number; onRevoke: () => void }) {
  const t = useTranslations('settings.apiTokens')
  const format = useFormat()
  const nameId = useId()
  const created = parseDate(token.createdAt)
  const expires = parseDate(token.expiresAt)
  const lastUsed = parseDate(token.lastUsedAt)
  const expired = !!expires && expires.getTime() <= now
  const details = [
    created && t('createdAt', { date: format.numericDate(created) }),
    token.expiresAt === null ? t('never') : expires && t('expiresAt', { date: format.numericDate(expires) }),
    token.lastUsedAt === null ? t('unused') : lastUsed && t('lastUsed', { date: format.numericDate(lastUsed) }),
  ].filter(Boolean)
  return <li className="flex items-start justify-between gap-3 py-3">
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span id={nameId} className="font-medium [overflow-wrap:anywhere]">{token.name}</span>
        <Badge variant="secondary">{t(token.scope === 'read' ? 'scopeRead' : 'scopeWrite')}</Badge>
        {expired && <Badge variant="destructive">{t('expired')}</Badge>}
      </div>
      <p className="font-mono text-xs text-muted-foreground">{token.prefix}…</p>
      <p className="text-xs text-muted-foreground">{details.join(' ・ ')}</p>
    </div>
    <Button variant="destructive" aria-describedby={nameId} onClick={onRevoke}>{t('revoke')}</Button>
  </li>
}

// Personal access tokens for /api/v1. The secret is shown once, in the dialog that issues it, and is never kept.
export default function ApiTokens() {
  const { status } = useSession()
  const t = useTranslations('settings.apiTokens')
  const common = useTranslations('common')
  const errors = useTranslations('errors')
  const errorText = useErrorText()
  const headingId = useId()
  const createButton = useRef<HTMLButtonElement>(null)
  const [tokens, setTokens] = useState<TokenSummary[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [issuing, setIssuing] = useState(false)
  const [revoking, setRevoking] = useState<TokenSummary | null>(null)
  const [now] = useState(() => Date.now())

  useEffect(() => {
    if (status !== 'authenticated') return
    let active = true
    listTokens().then(
      list => { if (active) setTokens(list) },
      reason => { if (active) setLoadError(errorText(reason, errors('workspaceRequestFailed'))) })
    return () => { active = false }
  }, [status, errorText, errors])

  const full = (tokens?.length ?? 0) >= MAX_TOKENS
  const usage = t('usage').split('`')

  return <section aria-labelledby={headingId} className="rounded-xl border bg-card p-4 sm:p-5">
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 sm:gap-x-4">
      <span className="grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground"><KeyRound className="size-5" aria-hidden="true" /></span>
      <div className="min-w-0 space-y-1">
        <h2 id={headingId} className="font-bold">{t('heading')}</h2>
        {status === 'unauthenticated' ? <p className="text-sm text-muted-foreground">{t('signedOut')}</p>
          : <p className="text-sm text-muted-foreground">{t('description')}</p>}
      </div>
    </div>
    {status === 'loading' && <div className="mt-4 sm:pl-14"><Skeleton className="h-10 w-full" /><span className="sr-only">{common('loading')}</span></div>}
    {status === 'authenticated' && <div className="mt-4 space-y-3 sm:pl-14">
      <p className="text-[13px] text-muted-foreground">{usage.map((part, index) =>
        <Fragment key={index}>{index % 2 ? <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs break-all">{part}</code> : part}</Fragment>)}</p>
      {loadError ? <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive"><CircleAlert className="size-4 shrink-0" aria-hidden="true" />{loadError}</p>
        : tokens === null ? <Skeleton className="h-10 w-full" />
        : tokens.length ? <ul className="divide-y rounded-lg border px-3.5">{tokens.map(token =>
          <TokenRow key={token.id} token={token} now={now} onRevoke={() => setRevoking(token)} />)}</ul>
        : <p className="text-sm text-muted-foreground">{t('empty')}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button ref={createButton} disabled={tokens === null || full} onClick={() => setIssuing(true)}><KeyRound aria-hidden="true" />{t('create')}</Button>
        {full && <p className="text-[13px] text-muted-foreground">{t('limit', { max: MAX_TOKENS })}</p>}
      </div>
      <IssueDialog open={issuing} onOpenChange={setIssuing} onIssued={token => setTokens(list => [token, ...(list ?? [])])} />
      <RevokeDialog token={revoking} onClose={() => setRevoking(null)} onRevoked={id => {
        setTokens(list => list?.filter(token => token.id !== id) ?? list)
        setRevoking(null)
        createButton.current?.focus()
      }} />
    </div>}
  </section>
}
