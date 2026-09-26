import { notFound } from 'next/navigation'
import { signIn } from '@/auth'
import { localDevelopmentEnabled } from '@/lib/localDevelopment'
import LocalLoginForm from './local-login-form'

export const dynamic = 'force-dynamic'

export default function LocalLoginPage() {
  if (!localDevelopmentEnabled()) notFound()
  async function login() {
    'use server'
    if (!localDevelopmentEnabled()) notFound()
    await signIn('local-development', { secret: process.env.AUTH_SECRET, redirect: false })
  }
  return <main className="mx-auto max-w-xl space-y-6 p-8">
    <h1 className="text-2xl font-bold">このMacでTypleを使う</h1>
    <p>国名193か国の練習を始められます。リストと練習記録は、このMacの専用データベースに保存されます。</p>
    <LocalLoginForm login={login} />
  </main>
}
