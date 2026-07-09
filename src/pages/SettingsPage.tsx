import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { Button, ErrorState, Header, PinField, TextField, useToast } from '../components/ui'
import { useAlive } from '../hooks/useAlive'
import { useApi } from '../hooks/useApi'
import { redirectIfUnauthorized, toErrorMessage } from '../api/client'
import { getMe, logout, updateMe } from '../api/auth'
import { clearAuthTokens, getRefreshToken } from '../lib/auth'
import { PIN_RE } from '../lib/pin'

/**
 * 설정 / 프로필 편집 · node 240:53 · GET /me, PATCH /me + 로그아웃.
 * PIN은 서버가 돌려주지 않으므로 빈 칸으로 시작 — 입력했을 때만 변경 요청에 포함한다.
 * [저장]은 실제 변경(닉네임 수정 또는 새 PIN 4자리 완성)이 있을 때만 활성화.
 */
export function SettingsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data: me, error: loadError, loading, refetch } = useApi('me', getMe)
  // 저장 성공 후 dirty 판정이 stale me.nickname과 비교하지 않게 서버 반영값을 따로 든다
  const [savedNickname, setSavedNickname] = useState<string | null>(null)
  const [nickname, setNickname] = useState('')
  const [pin, setPin] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alive = useAlive()

  useEffect(() => {
    if (me) {
      setSavedNickname(me.nickname)
      setNickname(me.nickname)
    }
  }, [me])

  const showForm = !loading && !loadError && !!me
  // 변경 없음(닉네임 그대로 + PIN 미입력)이면 저장할 것이 없다 — 비활성
  const dirty = savedNickname !== null && (nickname.trim() !== savedNickname || pin !== '')
  const canSubmit =
    !submitting && dirty && nickname.trim().length > 0 && (pin === '' || PIN_RE.test(pin))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      // pin은 입력했을 때만 변경 요청에 포함(undefined는 본문에서 빠진다)
      const updated = await updateMe({ nickname: nickname.trim(), pin: pin || undefined })
      if (!alive.current) return
      setSavedNickname(updated.nickname)
      setNickname(updated.nickname)
      setPin('')
      toast.show('🧀 저장했어요')
      setSubmitting(false)
    } catch (err) {
      if (!alive.current) return
      if (redirectIfUnauthorized(err, navigate)) return
      // 서버 에러 메시지(NICKNAME_TAKEN·INVALID_PIN)는 사용자 노출 가능한 한국어
      setError(toErrorMessage(err))
      setSubmitting(false)
    }
  }

  const handleLogout = async () => {
    if (loggingOut) return
    setLoggingOut(true)
    // 서버에서 refreshToken을 무효화한 뒤 로컬 토큰 삭제 — 서버 호출이 실패해도 로컬 로그아웃은 진행
    const refreshToken = getRefreshToken()
    if (refreshToken) {
      try {
        await logout(refreshToken)
      } catch {
        /* 서버 무효화 실패(네트워크·이미 만료 등)는 무시 — 로컬 로그아웃으로 진행 */
      }
    }
    clearAuthTokens()
    navigate('/', { replace: true })
  }

  return (
    <PhoneShell>
      {/* 와이어프레임의 '‹ 설정'은 별도 설정 목록 화면 전제 — MVP IA에선 이 화면이 설정 전체라 기존 서브형 헤더 관례(‹ 상위화면 + 타이틀)로 맞춘다 */}
      <Header backTo="/home" backLabel="홈" title="설정" backDisabled={submitting || loggingOut} />
      <main className="flex flex-1 flex-col px-5 pb-9 pt-5">
        <h2 className="text-xl font-bold text-text">프로필 편집</h2>
        {loading ? (
          <p className="py-11 text-center text-sm text-muted">프로필을 불러오는 중…</p>
        ) : loadError ? (
          <ErrorState error={loadError} onRetry={refetch} unauthorizedTo="/login" />
        ) : (
          <form id="profile-form" onSubmit={handleSubmit} noValidate className="mt-4">
            <div className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-4 shadow-card">
              <TextField
                label="닉네임"
                placeholder="닉네임 입력"
                autoComplete="username"
                value={nickname}
                disabled={submitting}
                onChange={(e) => setNickname(e.target.value)}
              />
              <PinField
                label="PIN 번호 변경 (숫자4자)"
                placeholder="변경할 때만 입력"
                autoComplete="new-password"
                value={pin}
                disabled={submitting}
                onChange={setPin}
              />
            </div>
            {error ? (
              <p role="alert" className="mt-3 text-sm text-warn">
                {error}
              </p>
            ) : null}
          </form>
        )}
        {/* 로그아웃은 앱 유일의 로그아웃 표면 — 프로필 로딩/실패 중에도 항상 접근 가능해야 한다 */}
        <div className="mt-auto flex flex-col gap-3 pt-6">
          <Button
            variant="secondary"
            fullWidth
            onClick={handleLogout}
            disabled={submitting || loggingOut}
          >
            {loggingOut ? '로그아웃 중…' : '로그아웃'}
          </Button>
          {showForm ? (
            <Button type="submit" form="profile-form" fullWidth disabled={!canSubmit || loggingOut}>
              {submitting ? '저장 중…' : '저장'}
            </Button>
          ) : null}
        </div>
      </main>
    </PhoneShell>
  )
}
