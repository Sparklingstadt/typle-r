import { auth } from '@/auth'

// The signed-in GitHub account that owns the workspace, or null.
export async function sessionOwner() {
  const session = await auth()
  const id = session?.user?.id
  return id && /^github:\d+$/.test(id) ? id : null
}

// State-changing requests from the screen must come from this site.
export function sameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(process.env.AUTH_URL ?? request.url).origin
}
