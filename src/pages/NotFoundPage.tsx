import { usePublicLocale } from '../i18n/usePublicLocale'
import { LanguagePicker } from '../i18n/LanguagePicker'
import { PublicMetadata } from '../i18n/PublicMetadata'
import { PhoneShell } from '../components/PhoneShell'
import { ButtonLink, EmptyState } from '../components/ui'

/** 404 — 잘못된 주소. '/'는 GuestGuard가 로그인 상태면 /home으로 보내므로 CTA 하나로 충분. */
export function NotFoundPage() {
  const { t } = usePublicLocale()
  return (
    <PhoneShell>
      <main className="flex flex-1 flex-col overflow-y-auto py-5">
        {/* justify-center 대신 my-auto — 고정 높이 셸에서 넘칠 때 위가 잘리지 않게(CHMO-396) */}
        <div className="my-auto px-5">
          <PublicMetadata
            title={t('notFoundTitle')}
            description={t('notFoundBody')}
            alternates={false}
          />
          <LanguagePicker />
          <EmptyState
            title={t('notFoundTitle')}
            description={t('notFoundBody')}
            action={<ButtonLink to="/">{t('home')}</ButtonLink>}
          />
        </div>
      </main>
    </PhoneShell>
  )
}
