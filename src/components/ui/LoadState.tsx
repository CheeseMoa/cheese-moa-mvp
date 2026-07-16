import type { ApiRequestError } from '../../api/client'
import { cx } from '../../lib/cx'
import { ErrorState } from './ErrorState'

interface LoadStateProps {
  loading: boolean
  error: ApiRequestError | null
  /** 로딩 문구 (기본 '불러오는 중…') */
  loadingText?: string
  /** 재요청(refetch) — ErrorState의 [다시 시도]로 노출 */
  onRetry?: () => void
  /** 401 복귀 목적지(로그인/잠금 해제) — 지정하면 즉시 리다이렉트 */
  unauthorizedTo?: string
  /** 404 복귀 목적지 — 지정하면 [다시 시도] 대신 돌아가기 CTA */
  notFoundTo?: string
  /** 돌아가기 CTA 라벨 (기본 '돌아가기') */
  notFoundLabel?: string
  /** 컨테이너 세로 여백 교체(시트 py-8 등 — 기본 py-11), 로딩·에러 양쪽에 적용 */
  className?: string
}

/**
 * useApi 미해결(로딩·실패) 공용 폴백 — 로딩 문구 또는 ErrorState, 둘 다 아니면 null (CHMO-181).
 * `loading ? <p>…불러오는 중</p> : error ? <ErrorState …/> : null` 꼬리를 대체한다.
 * 두 useApi를 합치는 화면은 `loading={a||b} error={b??a} onRetry={()=>{a();b()}}`로 그대로 넘긴다.
 */
export function LoadState({
  loading,
  error,
  loadingText = '불러오는 중…',
  onRetry,
  unauthorizedTo,
  notFoundTo,
  notFoundLabel,
  className,
}: LoadStateProps) {
  if (loading)
    return (
      <p className={cx('text-center text-sm text-muted', className ?? 'py-11')}>{loadingText}</p>
    )
  if (error)
    return (
      <ErrorState
        error={error}
        onRetry={onRetry}
        unauthorizedTo={unauthorizedTo}
        notFoundTo={notFoundTo}
        notFoundLabel={notFoundLabel}
        className={className}
      />
    )
  return null
}
