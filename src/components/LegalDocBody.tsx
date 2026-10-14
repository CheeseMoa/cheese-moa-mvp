import type { LegalDoc } from '../legal/types'

/**
 * 약관·정책 문서 본문 공용 렌더러 — /legal/* 전문 페이지(LegalDocPage)와 가입 동의 화면(01-A)의
 * [전문 보기] 바텀시트가 같은 문서를 같은 꼴로 그린다(CHMO-479에서 페이지 본문을 추출).
 * 버전 줄이 본문에 포함되는 이유: 동의 제출에 실리는 값(doc.version — CHMO-517)이라
 * 문서를 어디서 열든 화면 표기가 곧 증빙이어야 한다.
 *
 * 타이포는 Flutter 앱 `legal_sheet.dart`([전문 보기] 시트)의 수치를 그대로 옮겼다(CHMO-899,
 * `app.*` 팔레트) — 장(챕터) 라벨 13/800/muted·조 제목 15/700/ink·본문 13.5/1.6/ink·인트로
 * 박스는 옐로 14% 틴트. 같은 문서를 웹 공개 페이지와 앱 시트 양쪽에서 같은 수치로 읽는다.
 */
export function LegalDocBody({ doc }: { doc: LegalDoc }) {
  return (
    <>
      {/* 상태 표기(status)는 게시일 — "초안"류 미완성 고지는 쓰지 않는다(2026-08-03 출시 워딩 정리) */}
      <p className="text-[12px] text-app-muted">
        버전 {doc.version} · {doc.status}
      </p>
      {doc.intro ? (
        <p className="mt-4 rounded-[14px] bg-app-yellowTint p-3.5 text-[13.5px] leading-[1.6] text-app-ink">
          {doc.intro}
        </p>
      ) : null}
      {doc.sections.map((section, i) => (
        <section key={i}>
          {/* 장·조 제목은 크기·굵기·색으로 가른다(앱 legal_sheet.dart와 동일 수치) —
              장(13px·800·muted·자간0.2) > 조(15px·700·ink) > 본문(13.5px·1.6·ink) */}
          {section.chapter ? (
            <h2 className="mt-6 text-[13px] font-extrabold tracking-[0.02em] text-app-muted">
              {section.chapter}
            </h2>
          ) : null}
          {section.heading ? (
            <h3 className="mt-3 text-[15px] font-bold text-app-ink">{section.heading}</h3>
          ) : null}
          {section.body.map((block, j) =>
            Array.isArray(block) ? (
              <ul key={j} className="mt-2 flex flex-col gap-1.5 text-[13.5px] leading-[1.6] text-app-ink">
                {block.map((item, k) => (
                  <li key={k} className="flex gap-1.5">
                    <span aria-hidden>·</span>
                    <span className="min-w-0 flex-1">{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p key={j} className="mt-2 text-[13.5px] leading-[1.6] text-app-ink">
                {block}
              </p>
            ),
          )}
        </section>
      ))}
    </>
  )
}
