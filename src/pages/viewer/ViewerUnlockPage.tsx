import { useNavigate, useParams } from 'react-router-dom'
import { ScreenStub, StubButton } from '../../components/ScreenStub'
import { setViewerToken } from '../../lib/viewer'

/** 잠금 해제 (뷰어 진입) · POST /share/:token/unlock */
export function ViewerUnlockPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const unlock = () => {
    if (!token) return
    // 개발용 임시 잠금 해제 — 프로덕션 빌드에서는 토큰 주입 안 함
    if (import.meta.env.DEV) setViewerToken(token, 'dev-viewer-token')
    navigate(`/share/${token}/events`)
  }
  return (
    <ScreenStub
      code="뷰어"
      title="사진 보기"
      subtitle={`모임 공유 · 학부모 전용 비밀번호 입력 (구현 예정) · ${token ?? '—'}`}
    >
      <StubButton onClick={unlock}>임시 잠금 해제 (개발용)</StubButton>
    </ScreenStub>
  )
}
