export function localDevelopmentEnabled(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== 'development' || env.LOCAL_DEVELOPMENT_LOGIN !== '1' || !env.AUTH_SECRET) return false
  try {
    const url = new URL(env.AUTH_URL ?? '')
    if (url.protocol !== 'http:') return false
    if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return true
    const octets = url.hostname.split('.').map(Number)
    const privateAddress = octets.length === 4 && octets.every(n => Number.isInteger(n) && n >= 0 && n <= 255) &&
      (octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
       (octets[0] === 192 && octets[1] === 168))
    return privateAddress && env.LOCAL_DEVELOPMENT_LAN_HOST === url.hostname
  } catch { return false }
}
