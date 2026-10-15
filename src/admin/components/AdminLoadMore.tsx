import { toErrorMessage, type ApiRequestError } from '../../api/client'

/**
 * 커서 목록의 꼬리 (CHMO-931) — 페이지 버튼(`Pagination`)은 전체 수를 아는 봉투용이고, 커서 목록은
 * "다음이 있다"만 알아 [더 보기] 한 줄이 맞다. 다음이 없으면 아무것도 그리지 않는다(끝났다는
 * 안내는 표가 비어 보이게 할 뿐이다).
 */
export function AdminLoadMore({
  hasNext,
  loading,
  error,
  onLoadMore,
}: {
  hasNext: boolean
  loading: boolean
  error: ApiRequestError | null
  onLoadMore: () => void
}) {
  if (!hasNext && !error) return null
  return (
    <div className="flex items-center justify-center gap-3 border-t border-admin-border px-5 py-3">
      {error ? <span className="text-xs text-warn">{toErrorMessage(error)}</span> : null}
      <button
        type="button"
        onClick={onLoadMore}
        disabled={loading}
        className="h-8 rounded-lg border border-admin-border bg-admin-surface px-3 text-[13px] text-admin-text hover:bg-admin-bg disabled:opacity-40"
      >
        {loading ? '불러오는 중…' : error ? '다시 시도' : '더 보기'}
      </button>
    </div>
  )
}
