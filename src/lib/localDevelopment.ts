export function localDevelopmentEnabled(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== 'development' || env.LOCAL_DEVELOPMENT_LOGIN !== '1' || !env.AUTH_SECRET) return false
  try {
    const url = new URL(env.AUTH_URL ?? '')
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  } catch { return false }
}
