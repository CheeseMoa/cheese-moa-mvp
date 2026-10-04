import { Link } from 'react-router-dom'
import { BUSINESS_INFO, businessInfoRows, telHref } from '../legal/business'
import { cx } from '../lib/cx'

/**
 * 공개 페이지 하단 사업자·고객센터 정보 + 법적 고지 링크 (CHMO-899 AC-5·6).
 *
 * 값은 `legal/business.ts` 하나에서만 읽는다 — 페이지마다 따로 적으면 한 곳만 달라도 "신청서와
 * 불일치"다. 비어 있는 항목은 행째 빠진다(placeholder 노출 금지). 이용약관·개인정보처리방침·
 * 환불정책 링크는 결제 화면에도 따로 있지만, 사이트 어디서든 닿도록 여기에도 둔다(AC-5).
 *
 * 개인정보 처리방침은 법이 "다른 고지와 구분되게"(굵게 등) 표시하라고 한다(시행령 제31조③ —
 * 실무 관행) — 링크 중 그것만 굵게 둔다.
 */
export function SiteFooter({ className }: { className?: string }) {
  const rows = businessInfoRows()
  const linkCls = 'text-[12px] text-muted underline-offset-2 hover:underline'
  return (
    <footer className={cx('border-t border-border pt-5 text-[12px] leading-relaxed text-muted', className)}>
      <nav aria-label="약관 및 정책" className="flex flex-wrap gap-x-4 gap-y-1.5">
        <Link to="/pricing" className={linkCls}>
          요금 안내
        </Link>
        <Link to="/legal/terms" className={linkCls}>
          이용약관
        </Link>
        <Link to="/legal/privacy" className={cx(linkCls, 'font-bold text-text')}>
          개인정보처리방침
        </Link>
        <Link to="/legal/refund" className={linkCls}>
          환불정책
        </Link>
      </nav>
      {rows.length > 0 ? (
        <dl className="mt-3 flex flex-wrap gap-x-3 gap-y-0.5">
          {rows.map((row) => (
            <div key={row.key} className="flex gap-1">
              <dt>{row.label}</dt>
              <dd className="text-text/80">
                {row.key === 'phone' ? (
                  <a href={telHref(row.value)} className="underline-offset-2 hover:underline">
                    {row.value}
                  </a>
                ) : row.key === 'email' ? (
                  <a href={`mailto:${BUSINESS_INFO.email}`} className="underline-offset-2 hover:underline">
                    {row.value}
                  </a>
                ) : (
                  row.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className="mt-3">© 치즈모아</p>
    </footer>
  )
}
