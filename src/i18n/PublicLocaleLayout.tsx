import { useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { createPublicI18n } from './instance'
import { resolvePublicLocale } from './locale'
import { PublicLocaleContext } from './usePublicLocale'

export function PublicLocaleLayout() {
  const { search } = useLocation()
  const [languages, setLanguages] = useState(() =>
    navigator.languages?.length ? navigator.languages : [navigator.language],
  )
  useEffect(() => {
    const update = () =>
      setLanguages(navigator.languages?.length ? navigator.languages : [navigator.language])
    window.addEventListener('languagechange', update)
    return () => window.removeEventListener('languagechange', update)
  }, [])
  const locale = resolvePublicLocale(search, languages)
  const value = useMemo(() => ({ locale, i18n: createPublicI18n(locale) }), [locale])
  useEffect(() => {
    const previous = document.documentElement.lang
    document.documentElement.lang = locale
    return () => {
      document.documentElement.lang = previous
    }
  }, [locale])
  return (
    <PublicLocaleContext.Provider value={value}>
      <Outlet />
    </PublicLocaleContext.Provider>
  )
}
