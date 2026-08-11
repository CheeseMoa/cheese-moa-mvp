import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { Button, ConfirmDialog, Header, LoadState, TextField, Toggle, useToast } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { useMutation } from '../hooks/useMutation'
import { deleteAccount, getMe, logout, updateMe, updatePushEnabled } from '../api/auth'
import { clearAuthTokens, getRefreshToken } from '../lib/auth'
import { isAnalyticsOptedOut, setAnalyticsOptOut } from '../lib/analytics'
import {
  forgetPushTokenAfterAccountDelete,
  isPushSupported,
  pushPermissionStatus,
  unregisterPushOnLogout,
} from '../lib/push'
import { openAppSettings } from '../native/bridge'
import type { PushPermissionStatus } from '../native/types'

// 약관·정책 전문 링크 (CHMO-478) — 라우트는 가드 밖 /legal/*
const LEGAL_LINKS = [
  { to: '/legal/terms', label: '이용약관' },
  { to: '/legal/privacy', label: '개인정보 처리방침' },
  { to: '/legal/biometric', label: '얼굴 특징정보 처리 안내' },
]

// 신고·문의 창구(App Store 1.2 — 연락 수단, CHMO-526) — 공식 서비스 주소로 통일(CHMO-581,
// 처리방침 §13 보호책임자·이용약관 제21조③과 같은 주소 — §9 국외 이전 신설로 한 칸 밀림, CHMO-662).
// 스토어 등록정보의 지원 이메일도 이 주소로 맞춘다.
const SUPPORT_EMAIL = 'cheesemoa03@gmail.com'

/**
 * 설정 / 프로필 편집 · node 240:53 · GET /me, PATCH /me + 로그아웃.
 * [저장]은 실제 변경(이름 수정)이 있을 때만 활성화. PIN 변경 필드는 PIN 로그인 화면과 함께
 * 내렸다(CHMO-557 — 로그인 입구가 사라진 PIN은 쓸 곳이 없다. PATCH /me의 pin 계약은 api 계층에 잔존).
 * + 계정 삭제(App Store 5.1.1(v) — 앱 안에서 시작, 설정→[계정 삭제]→확인 두 탭 도달, CHMO-526.
 *   DELETE /me — 실 BE 확정 경로, CHMO-524·575) · 신고·문의 mailto(1.2 연락 창구).
 */
export function SettingsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const mutate = useMutation()
  const { data: me, error: loadError, loading, refetch } = useApi('me', getMe)
  // 저장 성공 후 dirty 판정이 stale me.nickname과 비교하지 않게 서버 반영값을 따로 든다
  const [savedNickname, setSavedNickname] = useState<string | null>(null)
  const [nickname, setNickname] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 계정 삭제(CHMO-526) — 확인 다이얼로그·진행 중
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  // 이용 통계 수집 토글(CHMO-662) — 처리방침 §12 '거부 방법'이 이 토글을 가리킨다.
  // 서버 상태가 아니라 기기 플래그(lib/analytics 소유)라 즉시 반영·실패 없음.
  const [analyticsOn, setAnalyticsOn] = useState(() => !isAnalyticsOptedOut())
  // 알림 받기(CHMO-667) — 세 값이 각각 다른 층이다: 셸 지원 여부·OS 권한·서버 수신 거부.
  // 앞의 둘은 브리지 왕복이라 도착 전엔 섹션을 그리지 않는다(브라우저에선 영영 false)
  const [pushSupported, setPushSupported] = useState(false)
  const [pushPermission, setPushPermission] = useState<PushPermissionStatus | null>(null)
  const [pushOn, setPushOn] = useState(true)
  const [pushBusy, setPushBusy] = useState(false)

  useEffect(() => {
    if (me) {
      setSavedNickname(me.nickname)
      setNickname(me.nickname)
      setPushOn(me.pushEnabled)
    }
  }, [me])

  // 앱 여부·OS 권한 조회. 화면을 떠난 뒤 도착한 응답은 버린다(마운트 1회 — 설정 앱에 다녀온
  // 뒤의 최신 권한은 화면 재진입에서 다시 읽힌다)
  useEffect(() => {
    let alive = true
    void (async () => {
      const supported = await isPushSupported()
      if (!alive) return
      setPushSupported(supported)
      if (!supported) return
      const status = await pushPermissionStatus()
      if (alive) setPushPermission(status)
    })()
    return () => {
      alive = false
    }
  }, [])

  /**
   * 서버 수신 거부 전환. 낙관적으로 먼저 뒤집고 실패하면 되돌린다 —
   * 토글은 즉시 반응해야 하는 컨트롤이라 왕복을 기다리며 멈춰 있으면 안 눌린 것처럼 보인다.
   */
  const handlePushToggle = async (next: boolean) => {
    if (pushBusy) return
    setPushBusy(true)
    setPushOn(next)
    await mutate(() => updatePushEnabled(next), {
      onSuccess: (updated) => {
        setPushOn(updated.pushEnabled)
        setPushBusy(false)
      },
      onError: (msg) => {
        setPushOn(!next)
        toast.show(msg)
        setPushBusy(false)
      },
    })
  }

  // 변경 없음(이름 그대로)이면 저장할 것이 없다 — 비활성
  const dirty = savedNickname !== null && nickname.trim() !== savedNickname
  const canSubmit = !submitting && dirty && nickname.trim().length > 0

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    await mutate(() => updateMe({ nickname: nickname.trim() }), {
      onSuccess: (updated) => {
        setSavedNickname(updated.nickname)
        setNickname(updated.nickname)
        toast.show('🧀 저장했어요')
        setSubmitting(false)
      },
      // 서버 에러 메시지(NICKNAME_TAKEN)는 사용자 노출 가능한 한국어
      onError: (msg) => {
        setError(msg)
        setSubmitting(false)
      },
    })
  }

  // 계정 삭제 — 서버가 refreshToken을 전부 지우므로 로그아웃 호출 없이 로컬 토큰만 폐기하고
  // 랜딩으로 복귀한다(AC: 저장된 토큰이 남지 않는다). 실패하면 토큰을 지우지 않는다 — 계정이
  // 살아 있는데 세션만 끊기면 "삭제됐다"로 오독된다.
  const handleDeleteAccount = async () => {
    setDeletingAccount(true)
    await mutate(() => deleteAccount(), {
      onSuccess: () => {
        // 기기 토큰 행은 계정과 함께 서버에서 사라졌다 — 로컬 흔적만 지운다(CHMO-667)
        forgetPushTokenAfterAccountDelete()
        clearAuthTokens()
        toast.show('계정을 삭제했어요')
        navigate('/', { replace: true })
      },
      onError: (msg) => {
        toast.show(msg)
        setDeletingAccount(false)
        setDeleteOpen(false)
      },
    })
  }

  const handleLogout = async () => {
    if (loggingOut) return
    setLoggingOut(true)
    // 이 기기의 푸시 해제가 먼저다(CHMO-667) — 인증이 필요한 호출이라 토큰을 지운 뒤엔 못 부른다.
    // 실패해도 로그아웃은 그대로 진행한다(아래 서버 무효화와 같은 관용 — 모듈이 삼킨다)
    await unregisterPushOnLogout()
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
      <Header
        backTo="/home"
        backLabel="홈"
        title="설정"
        backDisabled={submitting || loggingOut || deletingAccount}
      />
      <main className="flex flex-1 flex-col overflow-y-auto px-5 pb-safe-9 pt-5">
        <h2 className="text-xl font-bold text-text">프로필 편집</h2>
        {loading || loadError ? (
          <LoadState
            loading={loading}
            error={loadError}
            loadingText="프로필을 불러오는 중…"
            onRetry={refetch}
            unauthorizedTo="/login"
          />
        ) : (
          <form onSubmit={handleSubmit} noValidate className="mt-4">
            <div className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-4 shadow-card">
              {/* 라벨만 '이름'(소셜 표시명 이름 전환, CHMO-440) — 데이터 필드는 BE 계약 그대로 nickname */}
              <TextField
                label="이름"
                placeholder="이름 입력"
                autoComplete="username"
                value={nickname}
                disabled={submitting}
                onChange={(e) => setNickname(e.target.value)}
              />
            </div>
            {error ? (
              <p role="alert" className="mt-3 text-sm text-warn">
                {error}
              </p>
            ) : null}
            {/* [저장]은 조작 대상(이름 필드) 곁 — 로그아웃·계정 삭제 사이에 끼우지 않는다 (CHMO-579) */}
            <Button
              type="submit"
              fullWidth
              className="mt-4"
              disabled={!canSubmit || loggingOut || deletingAccount}
            >
              {submitting ? '저장 중…' : '저장'}
            </Button>
          </form>
        )}
        {/* 사용 안내 진입점은 없다 — 둘러보기(00-T)는 CHMO-578에서 삭제(안내는 코치 힌트가 전담),
            온보딩 슬라이드('사용 방법 다시 보기' → /onboarding) 링크도 내려 둔 상태(2026-07-28) */}
        {/* 약관·정책 — 프로필 로딩/실패와 무관하게 항상 접근 가능 (CHMO-478) */}
        <nav
          aria-label="약관·정책"
          className="mt-5 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-white shadow-card"
        >
          {LEGAL_LINKS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center justify-between px-4 py-3.5 text-[15px] text-text active:bg-surface"
            >
              {label}
              <span aria-hidden className="text-muted">
                ›
              </span>
            </Link>
          ))}
        </nav>
        {/* 알림 받기(CHMO-667) — 앱에서만 그린다(AC-4: 브라우저엔 수신 경로가 없어 토글도 없다).
            OS 권한과 서버 수신 거부는 다른 층이라 화면도 갈라진다: 권한이 없으면 토글을 켜 봐야
            알림이 안 오므로 토글 대신 설정 앱으로 보낸다(브리지 openAppSettings).
            약관·통계 섹션과 달리 프로필(me) 도착을 기다리는 이유: 토글이 보여 주는 값이
            서버 상태(pushEnabled)라, 못 읽은 채 그리면 실제와 반대인 스위치를 내놓게 된다 */}
        {pushSupported && me ? (
          <section
            aria-label="알림"
            className="mt-5 rounded-2xl border border-border bg-white px-4 py-3.5 shadow-card"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[15px] text-text">알림 받기</p>
              {pushPermission === 'granted' ? (
                <Toggle
                  checked={pushOn}
                  disabled={pushBusy}
                  onChange={(next) => void handlePushToggle(next)}
                />
              ) : (
                <Button variant="secondary" size="sm" onClick={() => void openAppSettings()}>
                  설정 열기
                </Button>
              )}
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              {pushPermission === 'granted'
                ? '참여 신청이 오거나 사진 분류가 끝나면 알려드려요.'
                : '휴대폰 설정에서 치즈모아 알림을 켜면 참여 신청·분류 완료를 알려드려요.'}
            </p>
          </section>
        ) : null}
        {/* 이용 통계 수집 거부(CHMO-662) — 처리방침 §12(자동 수집 장치)의 법정 필수 기재
            '거부 방법'의 실체. 문구·위치를 바꾸면 처리방침 §12·§9(국외 이전)도 같이 고친다 */}
        <section
          aria-label="이용 통계"
          className="mt-5 rounded-2xl border border-border bg-white px-4 py-3.5 shadow-card"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-[15px] text-text">이용 통계 수집</p>
            <Toggle
              checked={analyticsOn}
              onChange={(next) => {
                setAnalyticsOptOut(!next)
                setAnalyticsOn(next)
              }}
            />
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            어떤 화면이 많이 쓰이는지 익명으로 수집해 서비스 개선에 써요. 계정·사진과 연결되지
            않고, 꺼도 이용에 제한이 없어요.
          </p>
        </section>
        {/* 신고·문의 — App Store 1.2 연락 창구(CHMO-526). 서버 신고 큐 없이 mailto 한 줄이 전부라
            메일 앱으로 바로 넘긴다. 주소는 스토어 등록정보의 지원 이메일과 반드시 같아야 한다 */}
        <nav
          aria-label="지원"
          className="mt-5 overflow-hidden rounded-2xl border border-border bg-white shadow-card"
        >
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="flex items-center justify-between px-4 py-3.5 text-[15px] text-text active:bg-surface"
          >
            신고·문의
            <span aria-hidden className="text-muted">
              ›
            </span>
          </a>
        </nav>
        {/* 로그아웃은 앱 유일의 로그아웃 표면 — 프로필 로딩/실패 중에도 항상 접근 가능해야 한다.
            계정 삭제도 같은 이유로 폼 밖(App Store 5.1.1(v) — 심사자가 설정에서 바로 찾는다) */}
        <div className="mt-auto flex flex-col gap-3 pt-6">
          <Button
            variant="secondary"
            fullWidth
            onClick={handleLogout}
            disabled={submitting || loggingOut || deletingAccount}
          >
            {loggingOut ? '로그아웃 중…' : '로그아웃'}
          </Button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            disabled={submitting || loggingOut || deletingAccount}
            className="mx-auto px-3 py-1.5 text-[13px] text-warn"
          >
            계정 삭제
          </button>
        </div>
      </main>

      {/* 파기 범위(CHMO-524 초안)를 확인 문구에 명시 — 내가 마지막 선생님인 모임은 모임째 사라진다 */}
      <ConfirmDialog
        open={deleteOpen}
        danger
        busy={deletingAccount}
        busyLabel="삭제 중…"
        title="계정을 삭제할까요?"
        description="내가 마지막 선생님인 모임은 사진·앨범과 함께 완전히 삭제돼요. 다른 선생님이 있는 모임은 그대로 남고 나만 빠져요. 되돌릴 수 없어요."
        confirmLabel="삭제"
        onConfirm={() => void handleDeleteAccount()}
        onClose={() => {
          if (!deletingAccount) setDeleteOpen(false)
        }}
      />
    </PhoneShell>
  )
}
