import { Link } from 'react-router-dom'
import { PublicPageShell } from '../components/PublicPageShell'
import { LegalDocBody } from '../components/LegalDocBody'
import type { LegalDoc } from '../legal/types'
import { accountDeletionGuide, dataDeletionGuide } from '../legal/deletionGuides'

/**
 * 계정 삭제·데이터 삭제 안내 (CHMO-588) — Google Play 삭제 URL 요건 2종의 공개 페이지.
 * 스토어 등록정보에 URL이 그대로 실려 앱을 지운 사용자·심사관이 직접 열므로 가드 밖 라우트
 * (/legal/* 관습). 본문은 LegalDocBody 재사용, 아래 바로가기 행이 안내를 행동으로 잇는다 —
 * [설정]은 CreatorGuard라 로그아웃 상태면 로그인을 거쳐 홈에 떨어지는데, 그 동선 그대로를
 * 본문 단계 문구가 안내한다(returnTo 없음 — CHMO-588 범위 밖).
 * 틀은 PublicPageShell — /legal/* 와 같은 공개 페이지 틀·하단 사업자 정보(CHMO-899,
 * `app.*` 팔레트). 바로가기 행은 앱 `_BillingCard` 흰 카드(흰 바탕+1px #EBEBEB 테두리,
 * 그림자 대신 테두리로 경계를 만드는 쪽 — CHMO-727 실측) 결을 그대로 가져왔다.
 */

interface GuideAction {
  label: string
  /** 내부 이동(react-router) — href와 택일 */
  to?: string
  /** 앵커(mailto 등) */
  href?: string
}

function DeletionGuidePage({ doc, actions }: { doc: LegalDoc; actions: GuideAction[] }) {
  const rowCls =
    'flex items-center justify-between px-4 py-3.5 text-[15px] text-app-ink active:bg-app-chip'
  const chevron = (
    <span aria-hidden className="text-app-muted">
      ›
    </span>
  )
  return (
    <PublicPageShell title={doc.title}>
      <h1 className="mb-5 text-[26px] font-extrabold tracking-[-0.4px] text-app-ink">{doc.title}</h1>
      <LegalDocBody doc={doc} />
      <nav
        aria-label="바로가기"
        className="mt-8 divide-y divide-app-border overflow-hidden rounded-app border border-app-border bg-app-bg"
      >
        {actions.map((action) =>
          action.to ? (
            <Link key={action.label} to={action.to} className={rowCls}>
              {action.label}
              {chevron}
            </Link>
          ) : (
            <a key={action.label} href={action.href} className={rowCls}>
              {action.label}
              {chevron}
            </a>
          ),
        )}
      </nav>
    </PublicPageShell>
  )
}

export function AccountDeletionPage() {
  return (
    <DeletionGuidePage
      doc={accountDeletionGuide}
      actions={[
        { label: '설정에서 계정 삭제하기', to: '/settings' },
        { label: '개인정보 처리방침 보기', to: '/legal/privacy' },
      ]}
    />
  )
}

export function DataDeletionPage() {
  return (
    <DeletionGuidePage
      doc={dataDeletionGuide}
      actions={[
        { label: '이메일로 삭제 요청하기', href: 'mailto:cheesemoa03@gmail.com' },
        { label: '개인정보 처리방침 보기', to: '/legal/privacy' },
      ]}
    />
  )
}
