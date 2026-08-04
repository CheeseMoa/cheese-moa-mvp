import { toErrorMessage, toErrorReference, type ApiRequestError } from '../../api/client'

interface AdminMessageProps {
  text: string
  /** 재시도 가능한 실패만 버튼을 단다(권한 차단·404는 없음) */
  onRetry?: () => void
}

/** 카드 안 상태 한 줄 — 로딩·빈 목록·조회 실패 공용(어드민판 LoadState) */
export function AdminMessage({ text, onRetry }: AdminMessageProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-admin-border bg-admin-surface px-5 py-10">
      <p className="text-[13px] text-admin-muted">{text}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="h-8 rounded-lg border border-admin-border bg-admin-surface px-3 text-[13px] text-admin-text hover:bg-admin-bg"
        >
          다시 시도
        </button>
      ) : null}
    </div>
  )
}

/** 조회 실패 카드 — 메시지 정규화 + 제보용 추적 ID 한 줄(CHMO-500과 같은 규칙) */
export function AdminErrorMessage({
  error,
  onRetry,
}: {
  error: ApiRequestError
  onRetry?: () => void
}) {
  const reference = toErrorReference(error)
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-admin-border bg-admin-surface px-5 py-10">
      <p className="text-[13px] text-admin-muted">{toErrorMessage(error)}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="h-8 rounded-lg border border-admin-border bg-admin-surface px-3 text-[13px] text-admin-text hover:bg-admin-bg"
        >
          다시 시도
        </button>
      ) : null}
      {reference ? <p className="text-[11px] text-admin-muted/70">{reference}</p> : null}
    </div>
  )
}
