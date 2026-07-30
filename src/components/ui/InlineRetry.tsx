import { cx } from '../../lib/cx'

interface InlineRetryProps {
  /** 무엇을 못 불러왔는지 — "…을 불러오지 못했어요" 형태 */
  message: string
  onRetry: () => void
  /** 바깥 간격은 배치하는 화면이 정한다(예: 'mb-5') */
  className?: string
}

/**
 * 곁가지 조회가 실패했을 때 **화면을 가리지 않고** 알리는 한 줄(CHMO-520).
 * LoadState/ErrorState는 본문을 통째로 대체하므로, 그 조회가 이 화면의 주 내용이 아닐 때 쓴다 —
 * 20 초대 화면에서 초대 링크나 신청 목록 하나가 실패해도 멤버 명단은 그대로 보여야 한다.
 */
export function InlineRetry({ message, onRetry, className }: InlineRetryProps) {
  return (
    <div
      className={cx(
        'flex items-center justify-between gap-3 rounded-2xl border border-border bg-white p-4 shadow-card',
        className,
      )}
    >
      <p className="text-[13px] text-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 text-[13px] font-medium text-accent"
      >
        다시 시도
      </button>
    </div>
  )
}
