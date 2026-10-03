"use client"
import { signIn, signOut, useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import { LogIn, LogOut, Monitor, UsersRound } from 'lucide-react'
import { Avatar, DropdownMenu } from 'radix-ui'

const itemClass = "flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground"

function UserAvatar({ name, image, className }: { name: string; image?: string | null; className: string }) {
  return <Avatar.Root className={`relative flex shrink-0 overflow-hidden rounded-full bg-muted ${className}`}>
    <Avatar.Image src={image ?? undefined} alt="" className="size-full object-cover" />
    <Avatar.Fallback aria-hidden="true" className="flex size-full items-center justify-center bg-secondary text-sm font-semibold text-secondary-foreground">
      {Array.from(name.trim() || 'G')[0].toUpperCase()}
    </Avatar.Fallback>
  </Avatar.Root>
}

export default function AccountBar() {
  const { data: session, status } = useSession()
  const t = useTranslations('account')
  // Same size as the avatar button so the top bar does not shift once the session is known.
  if (status === 'loading') return <div className="flex size-10 items-center justify-center"><Skeleton className="size-8 rounded-full" /><span className="sr-only">{t('checking')}</span></div>
  if (!session?.user) return <Button variant="outline" size="lg" className="gap-2 px-3" aria-label={t('signInWithGitHub')} onClick={() => signIn('github')}>
    <LogIn aria-hidden="true" /><span className="sm:hidden">{t('signIn')}</span><span className="hidden sm:inline">{t('signInWithGitHub')}</span>
  </Button>
  const name = session.user.name ?? t('githubUser')
  return <DropdownMenu.Root>
    <DropdownMenu.Trigger asChild>
      <Button variant="ghost" size="icon" className="size-10 rounded-full" aria-label={t('menu')} title={name}>
        <UserAvatar name={name} image={session.user.image} className="size-8" />
      </Button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content align="end" sideOffset={8} className="z-50 w-60 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md">
        <DropdownMenu.Label className="flex items-center gap-3 px-3 py-2">
          <UserAvatar name={name} image={session.user.image} className="size-9" />
          <span className="grid min-w-0">
            <span className="truncate text-sm font-medium">{name}</span>
            <span className="text-xs text-muted-foreground">{t('signedInWithGitHub')}</span>
          </span>
        </DropdownMenu.Label>
        <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-border" />
        <DropdownMenu.Item asChild className={itemClass}>
          <Link href="/profiles"><UsersRound aria-hidden="true" />{t('manageProfiles')}</Link>
        </DropdownMenu.Item>
        <DropdownMenu.Item asChild className={itemClass}>
          <Link href="/devices"><Monitor aria-hidden="true" />{t('manageDevices')}</Link>
        </DropdownMenu.Item>
        <DropdownMenu.Item className={itemClass} onSelect={() => { void signOut({ callbackUrl: '/home' }) }}>
          <LogOut aria-hidden="true" />{t('signOut')}
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
}
