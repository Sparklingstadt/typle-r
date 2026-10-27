import type { Locale } from './config'
import type { Messages } from './messageTypes'

export type { Messages }

// Every area's file under src/messages/<locale>/; `satisfies` keeps this list in step with the message type.
const namespaces = Object.keys({
  errors: 0, format: 0, common: 0, metadata: 0, nav: 0, account: 0, settings: 0, devices: 0, interests: 0, guide: 0, about: 0, home: 0,
  practice: 0, wordLists: 0, records: 0, rankings: 0, dashboard: 0, globalError: 0, admin: 0,
} satisfies Record<keyof Messages, 0>) as (keyof Messages)[]

export async function loadMessages(locale: Locale): Promise<Messages> {
  return Object.fromEntries(await Promise.all(namespaces.map(async namespace =>
    [namespace, (await import(`@/messages/${locale}/${namespace}.json`)).default]))) as Messages
}

// Messages only server components read stay off the client, which receives the rest with every page.
// The admin dashboard's messages are given to its page alone (src/app/admin/page.tsx).
export function clientMessages({ guide: _guide, metadata: _metadata, globalError: _globalError, admin: _admin, ...messages }: Messages) {
  return messages
}
