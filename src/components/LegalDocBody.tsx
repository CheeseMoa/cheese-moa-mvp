import type { LegalDoc } from '../legal/types'

/**
 * 약관·정책 문서 본문 공용 렌더러 — /legal/* 전문 페이지(LegalDocPage)와 가입 동의 화면(01-A)의
 * [전문 보기] 바텀시트가 같은 문서를 같은 꼴로 그린다(CHMO-479에서 페이지 본문을 추출).
 * 버전 줄이 본문에 포함되는 이유: 동의 제출에 실리는 값(doc.version — CHMO-517)이라
 * 문서를 어디서 열든 화면 표기가 곧 증빙이어야 한다.
 */
export function LegalDocBody({ doc }: { doc: LegalDoc }) {
  return (
    <>
      {/* 시행일은 법률 검토 후 확정이라 초안 상태 표기(status)가 그 자리를 대신한다 */}
      <p className="rounded-xl bg-surface px-4 py-3 text-xs leading-relaxed text-muted">
        버전 {doc.version} · {doc.status}
      </p>
      {doc.intro ? <p className="mt-4 text-sm leading-relaxed text-text">{doc.intro}</p> : null}
      {doc.sections.map((section, i) => (
        <section key={i}>
          {/* 장·조 제목은 색과 크기가 가른다(CHMO-513) — 굵기 한 벌짜리 서체에서는 '15px 굵게 +
              14px 본문'이 사실상 같은 줄로 읽혀, 조문이 수십 개인 문서에서 목차가 사라진다.
              장(갈색·17px) > 조(갈색·15px) > 본문(먹색·14px) */}
          {section.chapter ? (
            <h2 className="mt-8 text-[17px] tracking-[0.01em] text-heading">{section.chapter}</h2>
          ) : null}
          {section.heading ? (
            <h3 className="mt-5 text-[15px] text-heading">{section.heading}</h3>
          ) : null}
          {section.body.map((block, j) =>
            Array.isArray(block) ? (
              <ul
                key={j}
                className="mt-2 flex flex-col gap-1.5 pl-5 text-sm leading-relaxed text-text"
              >
                {block.map((item, k) => (
                  <li key={k} className="list-disc">
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p key={j} className="mt-2 text-sm leading-relaxed text-text">
                {block}
              </p>
            ),
          )}
        </section>
      ))}
    </>
  )
}
