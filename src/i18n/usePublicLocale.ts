import { createContext, useContext } from 'react'
import type { i18n } from 'i18next'
import type { PublicLocale } from './locale'

export const PublicLocaleContext = createContext<{ locale: PublicLocale; i18n: i18n } | null>(null)

export function usePublicLocale() {
  const value = useContext(PublicLocaleContext)
  if (!value) throw new Error('PublicLocaleLayout is required')
  return { locale: value.locale, t: value.i18n.t.bind(value.i18n) }
}
