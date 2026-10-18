export const PUBLIC_LOCALES = ['ko', 'en', 'ja'] as const
export type PublicLocale = (typeof PUBLIC_LOCALES)[number]

function supported(value: string | null | undefined): PublicLocale | undefined {
  const base = value?.trim().toLowerCase().split(/[-_]/)[0]
  return PUBLIC_LOCALES.find((locale) => locale === base)
}

/** 명시 언어 → 브라우저 선호 목록의 첫 지원 언어 → 영어. 앱 CHMO-886과 동일. */
export function resolvePublicLocale(search: string, languages: readonly string[]): PublicLocale {
  const override = supported(new URLSearchParams(search).get('lang'))
  return override ?? languages.map(supported).find((locale) => locale !== undefined) ?? 'en'
}

/** 초대 키·이름·UTM·해시를 보존하고 lang만 바꾼다. */
export function withLanguage(path: string, locale: PublicLocale): string {
  const url = new URL(path, 'https://app.cheese-moa.com')
  url.searchParams.set('lang', locale)
  return `${url.pathname}${url.search}${url.hash}`
}
