import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { AppTour } from '../components/AppTour'
import { Button, ConfirmDialog, Header, LoadState, TextField, useToast } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { useMutation } from '../hooks/useMutation'
import { deleteAccount, getMe, logout, updateMe } from '../api/auth'
import { clearAuthTokens, getRefreshToken } from '../lib/auth'

// 약관·정책 전문 링크 (CHMO-478) — 라우트는 가드 밖 /legal/*
const LEGAL_LINKS = [
  { to: '/legal/terms', label: '이용약관' },
  { to: '/legal/privacy', label: '개인정보 처리방침' },
  { to: '/legal/biometric', label: '얼굴 특징정보 처리 안내' },
]

// 신고·문의 창구(App Store 1.2 — 연락 수단, CHMO-526) — 스토어 등록정보의 지원 이메일과 같은 주소
const SUPPORT_EMAIL = 'biniwonihyuni@gmail.com'

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
  const [tourOpen, setTourOpen] = useState(false)
  // 계정 삭제(CHMO-526) — 확인 다이얼로그·진행 중
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)

  useEffect(() => {
    if (me) {
      setSavedNickname(me.nickname)
      setNickname(me.nickname)
    }
  }, [me])

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
        {/* 첫 안내는 계정당 1회만 뜨므로 다시 볼 상시 진입점이 필요하다(CHMO-481·504).
            온보딩 슬라이드('사용 방법 다시 보기' → /onboarding) 링크는 **일단 내렸다**
            (2026-07-28 — 슬라이드 자체를 노출하지 않기로. 화면·라우트는 되살릴 수 있게 남겨 둔다) */}
        <nav
          aria-label="사용 안내"
          className="mt-5 overflow-hidden rounded-2xl border border-border bg-white shadow-card"
        >
          <button
            type="button"
            onClick={() => setTourOpen(true)}
            className="flex w-full items-center justify-between px-4 py-3.5 text-left text-[15px] text-text active:bg-surface"
          >
            치즈모아 둘러보기
            <span aria-hidden className="text-muted">
              ›
            </span>
          </button>
        </nav>
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

      <AppTour open={tourOpen} onClose={() => setTourOpen(false)} />
    </PhoneShell>
  )
}
