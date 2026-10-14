import type { ReactNode } from 'react'

/**
 * 어드민 폼 부품 (CHMO-928) — 이벤트 팝업·혜택 푸시가 어드민의 첫 **작성 화면**이라 처음 생겼다.
 * 종전 어드민 입력은 로그인 카드·답변 칸 둘뿐이라 그 자리의 스타일(h-10 · 옅은 보더 · 포커스는
 * 치즈 옐로)을 그대로 끌어와 한 벌로 묶었다.
 */

/**
 * 라벨 · (선택) 표기 · 글자 수 · 안내/오류 한 줄. 오류가 있으면 안내 대신 오류를 단다 —
 * 둘을 같이 늘어놓으면 무엇을 고쳐야 하는지가 묻힌다.
 */
export function Field({
  label,
  htmlFor,
  optional,
  hint,
  error,
  count,
  children,
}: {
  label: string
  htmlFor?: string
  optional?: boolean
  hint?: ReactNode
  error?: string | null
  /** 글자 수 — 상한을 넘기면 붉게 */
  count?: { value: number; max: number }
  children: ReactNode
}) {
  const over = count ? count.value > count.max : false
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-[13px] font-semibold text-admin-text">
          {label}
          {optional ? <span className="ml-1 font-normal text-admin-muted">(선택)</span> : null}
        </label>
        {count ? (
          <span className={`text-[11px] tabular-nums ${over ? 'text-warn' : 'text-admin-muted'}`}>
            {count.value} / {count.max}
          </span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p className="text-xs text-warn" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-relaxed text-admin-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export interface Choice<T extends string> {
  value: T
  label: string
}

/**
 * 고르는 칸 — 선택지가 셋 이하인 enum(대상·언어·여는 방식·발송 방식)용 세그먼트.
 * 셀렉트를 쓰지 않는 이유: 선택지가 접혀 있으면 "무엇 중에서 고르는지"가 화면에 남지 않는다.
 */
export function ChoiceGroup<T extends string>({
  label,
  value,
  choices,
  onChange,
  disabled,
}: {
  /** 스크린리더용 묶음 이름 */
  label: string
  value: T
  choices: Choice<T>[]
  onChange: (value: T) => void
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1.5">
      {choices.map((choice) => {
        const selected = choice.value === value
        return (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(choice.value)}
            className={`h-9 rounded-lg border px-3 text-[13px] disabled:opacity-50 ${
              selected
                ? 'border-primary bg-admin-nav font-semibold text-admin-text'
                : 'border-admin-border bg-admin-surface text-admin-muted hover:bg-admin-bg hover:text-admin-text'
            }`}
          >
            {choice.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * 켜기/끄기 스위치 — 켜짐은 치즈 옐로(어드민 포인트 색) 트랙. 누르면 바로 서버에 반영되는 자리
 * (팝업 목록)와 폼 값만 바꾸는 자리(작성 화면) 둘 다 쓴다.
 */
export function AdminSwitch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  /** 스크린리더용 — 화면엔 곁에 놓인 문구가 대신 말한다 */
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-fast disabled:opacity-50 ${
        checked ? 'border-primary bg-primary' : 'border-admin-border bg-admin-bg'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute h-4 w-4 rounded-full bg-white shadow transition-transform duration-fast ${
          checked ? 'translate-x-[17px]' : 'translate-x-px'
        }`}
      />
    </button>
  )
}

/**
 * 안내 상자 — 운영자가 **누르기 전에** 알아야 할 결과(앱 버전 제한·숨김 기록·정책)를 모은다.
 * 경고가 아니라 안내라 붉은색이 아니라 옅은 치즈 면이다(카피 톤 — 겁주지 않는다).
 */
export function AdminNotice({ title, lines }: { title?: string; lines: ReactNode[] }) {
  return (
    <div className="rounded-xl border border-primary/40 bg-admin-nav px-4 py-3">
      {title ? <p className="mb-1.5 text-[13px] font-semibold">{title}</p> : null}
      <ul className="space-y-1">
        {lines.map((line, index) => (
          <li key={index} className="flex gap-2 text-[13px] leading-relaxed text-admin-text">
            <span aria-hidden="true" className="text-admin-muted">
              ·
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 폼 묶음 카드 — 제목 한 줄 + 필드들 */
export function FormSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-admin-border bg-admin-surface px-5 py-5">
      <h2 className="text-[14px] font-semibold">{title}</h2>
      {description ? <p className="mt-0.5 text-xs text-admin-muted">{description}</p> : null}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}
