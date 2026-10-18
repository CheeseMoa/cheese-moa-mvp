import { Link, useLocation } from 'react-router-dom'
import { PUBLIC_LOCALES, withLanguage } from './locale'
import { usePublicLocale } from './usePublicLocale'

const names = { ko: '한국어', en: 'English', ja: '日本語' }

export function LanguagePicker() {
  const { locale, t } = usePublicLocale()
  const { pathname, search, hash } = useLocation()
  return (
    <nav aria-label={t('language')} className="mb-5 flex flex-wrap justify-end gap-1 text-sm">
      {PUBLIC_LOCALES.map((language) => (
        <Link
          key={language}
          lang={language}
          hrefLang={language}
          to={withLanguage(`${pathname}${search}${hash}`, language)}
          aria-current={language === locale ? 'true' : undefined}
          className={`inline-flex min-h-11 items-center rounded-lg px-3 ${language === locale ? 'bg-surface font-bold' : 'underline underline-offset-4'}`}
        >
          {names[language]}
        </Link>
      ))}
    </nav>
  )
}
