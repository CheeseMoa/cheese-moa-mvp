import { PublicPageShell } from '../components/PublicPageShell'
import { LegalDocBody } from '../components/LegalDocBody'
import type { LegalDoc } from '../legal/types'

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
  return (
    <PublicPageShell title={doc.title}>
      <h1 className="mb-5 text-[26px] font-extrabold tracking-[-0.4px] text-app-ink">{doc.title}</h1>
      <LegalDocBody doc={doc} />
    </PublicPageShell>
  )
}
