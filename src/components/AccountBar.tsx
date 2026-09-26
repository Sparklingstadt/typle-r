"use client"
import { signIn, signOut, useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Avatar, DropdownMenu } from 'radix-ui'

export default function AccountBar() {
  const { data: session, status } = useSession()
  return <div className="ml-auto flex min-w-0 max-w-full items-center justify-end gap-3 text-sm" aria-label="アカウント">
    {status === 'loading' ? <span>ログイン状態を確認中…</span> : session?.user ? <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost" size="icon-lg" className="rounded-full" aria-label="User menu" title={session.user.name ?? 'GitHubユーザー'}>
            <Avatar.Root className="relative flex size-9 shrink-0 overflow-hidden rounded-full bg-muted">
              <Avatar.Image src={session.user.image ?? undefined} alt={session.user.name ?? 'GitHubユーザー'} className="size-full object-cover" />
              <Avatar.Fallback role="img" aria-label={session.user.name ?? 'GitHubユーザー'} className="flex size-full items-center justify-center bg-secondary text-sm font-semibold text-secondary-foreground">
                {Array.from(session.user.name?.trim() || 'G')[0].toUpperCase()}
              </Avatar.Fallback>
            </Avatar.Root>
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={8} className="z-50 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md">
            <DropdownMenu.Item asChild className="flex cursor-pointer items-center rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground">
              <Link href="/devices">Manage devices</Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item className="flex cursor-pointer items-center rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground" onSelect={() => { void signOut({ callbackUrl: '/home' }) }}>
              Logout
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </> : <Button variant="outline" onClick={() => signIn('github')}>GitHubでログイン</Button>}
  </div>
}
