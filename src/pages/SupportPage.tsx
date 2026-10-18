import { Link } from 'react-router-dom'
import { PublicPageShell } from '../components/PublicPageShell'
import { BUSINESS_INFO } from '../legal/business'
import { usePublicLocale } from '../i18n/usePublicLocale'
import { withLanguage } from '../i18n/locale'
import { LanguagePicker } from '../i18n/LanguagePicker'
import { PublicMetadata } from '../i18n/PublicMetadata'

/** 스토어 등록용 공개 지원 URL. 응답 언어·처리 기한을 새로 약속하지 않는다. */
export function SupportPage() {
  const { locale, t } = usePublicLocale()
  const linkClass = 'flex min-h-11 items-center py-3 underline underline-offset-4'
  return (
    <PublicPageShell title={t('support')} translate={t} language={locale}>
      <PublicMetadata title={t('support')} description={t('supportIntro')} />
      <LanguagePicker />
      <h1 className="text-[26px] font-extrabold text-app-ink">{t('support')}</h1>
      <p className="mt-4 text-sm leading-relaxed">{t('supportIntro')}</p>
      <a className={`${linkClass} break-all`} href={`mailto:${BUSINESS_INFO.email}`}>
        {BUSINESS_INFO.email}
      </a>
      <nav aria-label={t('shortcuts')} className="mt-5 border-t border-app-border">
        <Link className={linkClass} to={withLanguage('/account-deletion', locale)}>
          {t('accountDeletion')}
        </Link>
        <Link className={linkClass} to={withLanguage('/data-deletion', locale)}>
          {t('dataDeletion')}
        </Link>
        <Link className={linkClass} to={withLanguage('/legal/privacy', locale)}>
          {t('privacyAction')}
        </Link>
      </nav>
    </PublicPageShell>
  )
}
