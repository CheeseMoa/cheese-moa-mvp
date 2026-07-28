/**
 * 약관·정책 문서 구조 (CHMO-478).
 * 정본은 docs/legal/*.md(변호사 검토용 — [[결정필요]]/[[검토필요]] 마커 포함),
 * src/legal/*.ts는 마커 자리를 중립 문구로 치환한 앱 적용판이다.
 * 내용을 고칠 때는 반드시 정본과 함께 고친다.
 */

/** 본문 블록 — 문자열은 문단, 배열은 불릿 리스트 */
export type LegalBlock = string | string[]

export interface LegalSection {
  /** 장 구분 제목(이용약관의 "제1장 총칙" 등) — 있으면 조 제목 위에 표시 */
  chapter?: string
  /** 조·항목 제목 */
  heading?: string
  body: LegalBlock[]
}

export interface LegalDoc {
  title: string
  /** 문서 상태 표기 — 확정 전에는 초안 고지를 유지한다 */
  status: string
  /** 문서 머리 안내(있으면 제목 아래 강조 박스) */
  intro?: string
  sections: LegalSection[]
}
