import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import type { ApiRequestError } from '../../lib/api'
import { toErrorMessage } from '../../lib/api'
import { cx } from '../../lib/cx'
import { Button, ButtonLink } from './Button'

interface ErrorStateProps {
  error: ApiRequestError
  /** 재요청(refetch) — 404 복귀 CTA가 없을 때 [다시 시도]로 노출. 영구 실패만 다루는 화면은 생략 */
  onRetry?: () => void
  /** 401(토큰 무효 — apiFetch가 이미 삭제) 복귀 목적지(로그인/잠금 해제) — 지정하면 즉시 리다이렉트 */
  unauthorizedTo?: string
  /** 404(영구 실패) 복귀 목적지 — 지정하면 [다시 시도] 대신 돌아가기 CTA */
  notFoundTo?: string
  /** 돌아가기 CTA 라벨 (기본 '돌아가기') */
  notFoundLabel?: string
  /** 컨테이너 세로 여백 교체용(시트는 py-8 등 — 기본 py-11) */
  className?: string
  /** CTA 아래 추가 액션(커스텀 복귀 버튼 등) */
  children?: ReactNode
}

/**
 * useApi 실패 공용 표시 — warn 메시지(role=alert) + 복구 액션 (CHMO-118 에러 상태 정리).
 * 401은 재시도가 영원히 실패하므로 unauthorizedTo로 재인증 화면 복귀,
 * 404는 재시도해도 같은 결과라 notFoundTo가 있으면 [다시 시도] 대신 복귀 CTA를 준다.
 */
export function ErrorState({
  error,
  onRetry,
  unauthorizedTo,
  notFoundTo,
  notFoundLabel = '돌아가기',
  className,
  children,
}: ErrorStateProps) {
  if (error.status === 401 && unauthorizedTo) return <Navigate to={unauthorizedTo} replace />
  return (
    <div className={cx('flex flex-col items-center gap-3', className ?? 'py-11')}>
      <p role="alert" className="text-center text-sm text-warn">
        {toErrorMessage(error)}
      </p>
      {error.status === 404 && notFoundTo ? (
        <ButtonLink to={notFoundTo} replace size="sm" variant="secondary">
          {notFoundLabel}
        </ButtonLink>
      ) : onRetry ? (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          다시 시도
        </Button>
      ) : null}
      {children}
    </div>
  )
}
