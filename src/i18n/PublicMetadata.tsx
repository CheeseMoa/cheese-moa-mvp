import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { PUBLIC_LOCALES, withLanguage } from './locale'
import { usePublicLocale } from './usePublicLocale'

/** SPA용 메타. JS를 실행하지 않는 미리보기 봇에는 index.html 기본값이 적용된다. */
export function PublicMetadata({
  title,
  description,
  koreanOnly = false,
  alternates = true,
}: {
  title: string
  description: string
  koreanOnly?: boolean
  alternates?: boolean
}) {
  const { locale } = usePublicLocale()
  const { pathname } = useLocation()
  useEffect(() => {
    const previousTitle = document.title
    document.title = title
    const nodes: HTMLElement[] = []
    const meta = (key: string, content: string, property = true) => {
      const node = document.createElement('meta')
      node.setAttribute(property ? 'property' : 'name', key)
      node.content = content
      document.head.appendChild(node)
      nodes.push(node)
    }
    meta('og:title', title)
    meta('og:description', description)
    meta('description', description, false)
    meta('og:locale', { ko: 'ko_KR', en: 'en_US', ja: 'ja_JP' }[locale])
    // 초대 주소의 키·쿼리를 메타에 복제하지 않는다. 한국어 원문에는 가짜 번역 대체 URL을 붙이지 않는다.
    if (alternates && !pathname.startsWith('/join/')) {
      for (const language of koreanOnly ? (['ko'] as const) : PUBLIC_LOCALES) {
        const node = document.createElement('link')
        node.rel = 'alternate'
        node.hreflang = language
        node.href = `https://app.cheese-moa.com${withLanguage(pathname, language)}`
        document.head.appendChild(node)
        nodes.push(node)
      }
    }
    return () => {
      document.title = previousTitle
      nodes.forEach((node) => node.remove())
    }
  }, [locale, title, description, pathname, koreanOnly, alternates])
  return null
}
