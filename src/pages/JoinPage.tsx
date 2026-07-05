import { useEffect, useRef } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { JoinGroupModal } from '../components/JoinGroupModal'
import { useToast } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { isAuthenticated } from '../lib/auth'
import type { Group } from '../types/api'

/**
 * 02-1. 모임 참여 (초대 링크 진입) · node 211:1520 · POST /groups/join.
 * 참여는 로그인 전제 — 미로그인이면 returnTo를 실어 로그인으로 보내고, 완료 후 이 링크로 복귀한다.
 * 이미 참여한 모임의 링크 재진입은 비밀번호를 묻지 않고 바로 모임 상세로 보낸다(사전 감지).
 */
export function JoinPage() {
  const { joinKey } = useParams<{ joinKey: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const authed = isAuthenticated()

  // 코드가 비는 잘못된 링크(/join/%20 등)는 고정 모드로 죽은 폼이 되므로 직접 입력 모드로 폴백
  const fixedJoinKey = joinKey?.trim() ? joinKey.trim().toUpperCase() : undefined

  // 이미 멤버인지 사전 감지 — 조회 실패 시에는 기존처럼 모달을 띄운다(참여를 막지 않음)
  const { data, loading } = useApi<{ groups: Group[] }>(
    authed && fixedJoinKey ? '/groups' : null,
  )
  const memberGroup = fixedJoinKey
    ? data?.groups.find((g) => g.joinKey === fixedJoinKey)
    : undefined

  const redirected = useRef(false)
  useEffect(() => {
    if (!memberGroup || redirected.current) return
    redirected.current = true
    toast.show('🧀 이미 참여 중인 모임이에요')
    navigate(`/groups/${memberGroup.id}`, { replace: true })
  }, [memberGroup, navigate, toast])

  if (!authed)
    return <Navigate to="/login" replace state={{ returnTo: `/join/${joinKey ?? ''}` }} />

  return (
    <PhoneShell>
      {/* 멤버십 확인 중·이동 대기 중엔 비밀번호 모달을 띄우지 않는다(깜빡임·불필요한 입력 방지) */}
      <JoinGroupModal
        open={!loading && !memberGroup}
        fixedJoinKey={fixedJoinKey}
        onClose={() => navigate('/home', { replace: true })}
      />
    </PhoneShell>
  )
}
