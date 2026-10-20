import { isAdminHost } from '../lib/appHost'

/** 화면 URL 전용. BE의 /admin API 경로는 바꾸지 않는다. */
export function adminPath(path = '', hostname: string = window.location.hostname): string {
  const base = isAdminHost(hostname) ? '' : '/admin'
  return `${base}${path}` || '/'
}
