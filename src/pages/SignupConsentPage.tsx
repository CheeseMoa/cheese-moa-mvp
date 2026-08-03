import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { LegalDocBody } from '../components/LegalDocBody'
import { BottomSheet, Button, LoadState } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { useMutation } from '../hooks/useMutation'
import { listAgreements, submitAgreements } from '../api/agreements'
import { evaluateConsentGate } from '../lib/consentGate'
import {
  FACE_SECTION_LABEL,
  SIGNUP_AGREEMENT_ITEMS,
  SIGNUP_CONSENT_NOTICE,
  SIGNUP_FACE_ITEM,
  SIGNUP_GENERAL_ITEMS,
} from '../legal/signupAgreements'
import type { SignupAgreementItem } from '../legal/signupAgreements'
import type { AgreementType } from '../types/api'

/** 로그인 게이트가 실어 주는 원 목적지 — 새로고침으로 유실되면 홈 */
interface ConsentLocationState {
  returnTo?: string
}

/**
 * 01-A. 가입 동의 (CHMO-479 · 정본 docs/legal/app-copy.md §1~§4) — 첫 로그인(=소셜 가입) 후
 * 필수 동의를 수집해야 서비스에 들어간다. 로그인 성공 시점(01-C 소셜 콜백·DEV 로그인)이
 * `evaluateConsentGate`로 판정해 여기로 보내고, 기존 계정도 기록이 없으면 한 번은 지난다.
 *
 * 설계 제약(정본 §1.1 — 반드시 지킬 것):
 * ① 얼굴 특징정보 동의는 "전체 동의"에 포함하지 않는다(법 제23조 민감정보 별도 동의) —
 *    구획선 아래 별도 영역에서 개별 체크. ② 필수 항목 기본 체크 금지 — 사용자가 직접 체크.
 *
 * [전문 보기]는 화면 이탈 없이 바텀시트로 연다 — 체크 상태가 컴포넌트 state라 라우팅으로
 * 나가면 날아간다. 렌더러는 /legal/* 전문 페이지와 같은 LegalDocBody(보여준 문서 = 제출 버전).
 *
 * 제출은 화면에 보여준 FE 문구 버전을 싣는다(CHMO-517). 서버 버전과 다르면(구버전 번들 캐시)
 * 동의 화면 대신 새로고침 안내로 빠진다 — 제출해 봐야 VALID400이라 체크부터 시키지 않는다.
 */
export function SignupConsentPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const mutate = useMutation()
  const returnTo = (location.state as ConsentLocationState | null)?.returnTo ?? '/home'

  const agreementsApi = useApi('agreements', (signal) => listAgreements(signal))
  const verdict = agreementsApi.data ? evaluateConsentGate(agreementsApi.data) : null

  // 필수 항목 기본 체크 금지(설계 제약 ②) — 전부 해제로 시작한다
  const [checked, setChecked] = useState<Partial<Record<AgreementType, boolean>>>({})
  const [docItem, setDocItem] = useState<SignupAgreementItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generalAllChecked = SIGNUP_GENERAL_ITEMS.every((item) => checked[item.type])
  const allRequiredChecked = SIGNUP_AGREEMENT_ITEMS.every((item) => checked[item.type])

  const toggle = (type: AgreementType) =>
    setChecked((prev) => ({ ...prev, [type]: !prev[type] }))

  // 전체 동의는 일반 항목만 켜고 끈다 — 얼굴 특징정보는 별도 영역에서 직접(설계 제약 ①)
  const toggleGeneralAll = () =>
    setChecked((prev) => {
      const next = { ...prev }
      for (const item of SIGNUP_GENERAL_ITEMS) next[item.type] = !generalAllChecked
      return next
    })

  const handleSubmit = async () => {
    if (!allRequiredChecked || submitting) return
    setSubmitting(true)
    setError(null)
    // 버튼이 전 항목 체크에서만 열리므로 전부 agreed: true — 버전은 화면에 보여준 문구의 것
    await mutate(
      () =>
        submitAgreements(
          SIGNUP_AGREEMENT_ITEMS.map((item) => ({
            type: item.type,
            version: item.version,
            agreed: true,
          })),
        ),
      {
        onSuccess: () => navigate(returnTo, { replace: true }),
        onError: (msg) => {
          setError(msg)
          setSubmitting(false)
        },
      },
    )
  }

  // 이미 전부 동의된 계정의 직접 진입(주소창 등) — 수집할 것이 없으니 원 목적지로
  if (verdict === 'pass') return <Navigate to={returnTo} replace />

  return (
    <PhoneShell>
      <main className="flex flex-1 flex-col overflow-y-auto px-5 pt-7">
        <h1 className="text-xl text-heading">서비스 이용 동의</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          치즈모아를 시작하려면 아래 항목을 확인하고 동의해 주세요.
        </p>

        <LoadState
          loading={agreementsApi.loading}
          error={agreementsApi.error}
          onRetry={agreementsApi.refetch}
          unauthorizedTo="/login"
        />

        {verdict === 'stale' ? (
          // 서버가 아는 버전과 이 앱이 보여줄 문구의 버전이 다르다 — 새 문구 배포 후 구버전
          // 번들을 캐시로 들고 있는 상태. 체크를 받아도 제출이 거부되므로 새로고침부터.
          <div className="my-auto py-10 text-center">
            <p className="text-sm leading-relaxed text-text">
              약관 문구가 새 버전으로 바뀌었어요.
              <br />
              새로고침한 뒤 다시 동의해 주세요.
            </p>
            <div className="mt-6">
              <Button fullWidth onClick={() => window.location.reload()}>
                새로고침
              </Button>
            </div>
          </div>
        ) : verdict === 'consent' ? (
          <>
            <label className="mt-6 flex cursor-pointer items-center gap-2.5 rounded-2xl border border-border bg-white px-4 py-3.5 shadow-card-sm">
              <input
                type="checkbox"
                checked={generalAllChecked}
                onChange={toggleGeneralAll}
                disabled={submitting}
                className="h-5 w-5 shrink-0 accent-accent"
              />
              <span className="text-[15px] text-heading">전체 동의</span>
            </label>
            <p className="mt-1.5 pl-1 text-xs leading-relaxed text-muted">
              얼굴 인식 기능 동의는 아래에서 따로 체크해요.
            </p>

            <div className="mt-3">
              {SIGNUP_GENERAL_ITEMS.map((item) => (
                <ConsentRow
                  key={item.type}
                  item={item}
                  checked={!!checked[item.type]}
                  disabled={submitting}
                  onToggle={() => toggle(item.type)}
                  onShowDoc={() => setDocItem(item)}
                />
              ))}
            </div>

            {/* 별도 영역(설계 제약 ①) — 구획선 + 라벨로 전체 동의 묶음과 시각적으로 가른다 */}
            <div className="mt-3 border-t border-border pt-4">
              <p className="text-xs tracking-[0.06em] text-muted">{FACE_SECTION_LABEL}</p>
              <ConsentRow
                item={SIGNUP_FACE_ITEM}
                checked={!!checked[SIGNUP_FACE_ITEM.type]}
                disabled={submitting}
                onToggle={() => toggle(SIGNUP_FACE_ITEM.type)}
                onShowDoc={() => setDocItem(SIGNUP_FACE_ITEM)}
              />
            </div>
          </>
        ) : null}
      </main>

      {verdict === 'consent' ? (
        <div className="shrink-0 px-5 pb-safe-7 pt-3">
          {error ? (
            <p role="alert" className="mb-2 text-sm text-warn">
              {error}
            </p>
          ) : null}
          <p className="mb-2.5 text-center text-xs text-muted">{SIGNUP_CONSENT_NOTICE}</p>
          <Button fullWidth disabled={!allRequiredChecked || submitting} onClick={handleSubmit}>
            {submitting ? '저장 중…' : '동의하고 시작하기'}
          </Button>
        </div>
      ) : null}

      {/* [전문 보기] — 화면 이탈 없이 본다(체크 상태 보존). bodyScrollable: 전문이 길다 */}
      <BottomSheet
        open={docItem !== null}
        onClose={() => setDocItem(null)}
        title={docItem?.fullText?.title}
        bodyScrollable
      >
        {docItem?.fullText ? (
          <div className="px-1 pb-2">
            <LegalDocBody doc={docItem.fullText} />
          </div>
        ) : null}
      </BottomSheet>
    </PhoneShell>
  )
}

interface ConsentRowProps {
  item: SignupAgreementItem
  checked: boolean
  disabled: boolean
  onToggle: () => void
  onShowDoc: () => void
}

/** 동의 항목 한 줄 — [전문 보기]는 label 밖에 둔다(label 안 버튼은 탭이 체크 토글로도 번진다) */
function ConsentRow({ item, checked, disabled, onToggle, onShowDoc }: ConsentRowProps) {
  return (
    <div className="flex items-start gap-1 py-2.5">
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          disabled={disabled}
          className="mt-0.5 h-5 w-5 shrink-0 accent-accent"
        />
        <span className="min-w-0 text-sm leading-snug text-text">
          <span className="text-muted">(필수)</span> {item.label}
          {item.caption ? (
            <span className="mt-1 block text-xs leading-relaxed text-muted">{item.caption}</span>
          ) : null}
        </span>
      </label>
      {item.fullText ? (
        <button
          type="button"
          onClick={onShowDoc}
          className="shrink-0 px-1 py-0.5 text-xs text-accent underline underline-offset-2"
        >
          전문 보기
        </button>
      ) : null}
    </div>
  )
}
