import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import Credentials from 'next-auth/providers/credentials'
import { localDevelopmentEnabled } from './lib/localDevelopment'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub, ...(localDevelopmentEnabled() ? [Credentials({
    id: 'local-development',
    name: 'このMacで練習',
    credentials: { secret: { type: 'password' } },
    authorize(credentials) {
      if (!localDevelopmentEnabled() || credentials.secret !== process.env.AUTH_SECRET) return null
      return { id: 'github:0', name: 'ローカル練習用' }
    },
  })] : [])],
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, account }) {
      if (account?.provider === 'github') token.sub = `github:${account.providerAccountId}`
      return token
    },
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub
      return session
    },
  },
})
