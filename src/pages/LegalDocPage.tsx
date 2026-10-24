import { usePublicLocale } from '../i18n/usePublicLocale'
import { LanguagePicker } from '../i18n/LanguagePicker'
import { PublicMetadata } from '../i18n/PublicMetadata'
import { useLocation } from 'react-router-dom'
import { PublicPageShell } from '../components/PublicPageShell'
import { LegalDocBody } from '../components/LegalDocBody'
import type { LegalDoc } from '../legal/types'
import { appStorePurchaseNotice } from '../legal/refund'

/**
 * 약관·정책 전문 공용 렌더러 (CHMO-478) — /legal/* 문서 데이터만 바꿔 공유한다.
 * 설정·동의 화면·외부 공개 URL(스토어·결제대행사 심사 등) 어디서든 열리므로 가드 밖 라우트.
 * 본문은 LegalDocBody — 가입 동의 화면(01-A)의 [전문 보기] 시트와 같은 렌더러(CHMO-479).
 *
 * 틀은 PublicPageShell(CHMO-899, `app.*` 팔레트) — 종전 PhoneShell(390 폰 프레임) + 뒤로가기
 * 헤더는 PC로 연 심사 담당자에게 가운데 작은 폰이 떠 있는 꼴이었다. 문서 페이지라 브라우저
 * 뒤로가기로 충분하고, 하단 사업자 정보·약관 링크(SiteFooter)를 셸이 함께 그린다(모든 공개
 * 페이지 동일 — AC-6).
 */
export function LegalDocPage({ doc }: { doc: LegalDoc }) {
  const { locale, t } = usePublicLocale()
  const { pathname } = useLocation()
  const title = t(pathname.split('/').pop() ?? 'terms')
  return (
    <PublicPageShell title={title} translate={t} language={locale}>
      <PublicMetadata
        title={title}
        description={locale === 'ko' ? doc.title : t('legalPending')}
        koreanOnly
      />
      <LanguagePicker />
      {locale !== 'ko' && (
        <p role="note" className="mb-5 rounded-xl bg-app-yellowTint p-4 text-sm leading-relaxed">
          {t('legalPending')}
        </p>
      )}
      <div lang="ko">
        <h1 className="mb-5 text-[26px] font-extrabold tracking-[-0.4px] text-app-ink">
          {doc.title}
        </h1>
        {pathname === '/legal/terms' && (
          <section
            aria-label="앱 스토어 결제·구독 안내"
            className="mb-8 border-b border-app-border pb-8"
          >
            <h2 className="mb-4 text-xl font-bold">{appStorePurchaseNotice.title}</h2>
            <p className="mb-4 text-sm leading-relaxed">
              이용약관 제9조에 따라 별도로 안내하는 앱 스토어 상품의 결제·구독 조건입니다. 앱에서
              유료 상품을 구매하는 경우에 적용되며, 기존 웹 직접 결제에는 구매 당시 조건과 환불
              기준이 적용됩니다.
            </p>
            <LegalDocBody doc={appStorePurchaseNotice} />
          </section>
        )}
        <LegalDocBody doc={doc} />
      </div>
    </PublicPageShell>
  )
}
