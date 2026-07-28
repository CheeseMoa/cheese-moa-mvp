import { useNavigate } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { Header } from '../components/ui'
import type { LegalDoc } from '../legal/types'

/**
 * 약관·정책 전문 공용 렌더러 (CHMO-478) — /legal/* 3종이 문서 데이터만 바꿔 공유한다.
 * 설정·동의 화면·외부 공개 URL(스토어 심사 등) 어디서든 열리므로 가드 밖 라우트.
 */
export function LegalDocPage({ doc }: { doc: LegalDoc }) {
  const navigate = useNavigate()
  // 진입점이 여럿이라 절대경로 backTo 대신 히스토리 복귀 — 직접 URL 진입(첫 엔트리)이면
  // -1이 앱 밖으로 나가므로 랜딩으로 폴백
  const handleBack = () => {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/', { replace: true })
  }

  return (
    <PhoneShell>
      <Header onBack={handleBack} title={doc.title} />
      <main className="flex-1 overflow-y-auto px-5 pb-safe-9 pt-5">
        <p className="rounded-xl bg-surface px-4 py-3 text-xs leading-relaxed text-muted">
          {doc.status}
        </p>
        {doc.intro ? (
          <p className="mt-4 text-sm leading-relaxed text-text">{doc.intro}</p>
        ) : null}
        {doc.sections.map((section, i) => (
          <section key={i}>
            {section.chapter ? (
              <h2 className="mt-8 text-base font-bold text-heading">{section.chapter}</h2>
            ) : null}
            {section.heading ? (
              <h3 className="mt-5 text-[15px] font-bold text-text">{section.heading}</h3>
            ) : null}
            {section.body.map((block, j) =>
              Array.isArray(block) ? (
                <ul key={j} className="mt-2 flex flex-col gap-1.5 pl-5 text-sm leading-relaxed text-text">
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
      </main>
    </PhoneShell>
  )
}
