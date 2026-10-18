import { Link, useLocation, useNavigate } from 'react-router-dom'
import { PUBLIC_LOCALES, withLanguage } from './locale'
import { usePublicLocale } from './usePublicLocale'

const names = { ko: '한국어', en: 'English', ja: '日本語' }

export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const { locale, t } = usePublicLocale()
  const { pathname, search, hash } = useLocation()
  const navigate = useNavigate()
  if (compact) {
    return (
      <select
        aria-label={t('language')}
        value={locale}
        onChange={(event) =>
          navigate(withLanguage(`${pathname}${search}${hash}`, event.target.value as typeof locale))
        }
        className="min-h-11 max-w-[140px] cursor-pointer rounded-lg border-0 bg-transparent pl-2 pr-1 text-sm text-app-inkSub focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-ink"
      >
        {PUBLIC_LOCALES.map((language) => (
          <option key={language} value={language} lang={language}>
            {names[language]}
          </option>
        ))}
      </select>
    )
  }
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
