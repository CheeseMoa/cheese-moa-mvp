import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import { Button, Header, PhotoGrid, PhotoTile, Toggle, useToast } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { apiFetch, ApiRequestError, toErrorMessage } from '../lib/api'
import type { AnalysisJob, EventItem, PresignResponse } from '../types/api'

/** 기기에서 고른 파일 + 미리보기 — key는 같은 파일 중복 추가 방지용 */
interface PickedPhoto {
  key: string
  file: File
  previewUrl: string
  selected: boolean
  /** 이전 시도에서 S3 PUT까지 성공 — 재시도 시 재업로드(서버 중복 등록) 방지 */
  uploaded: boolean
}

/** 업로드 단계 — uploading은 presign+S3 PUT, analyzing은 분석 시작 요청 */
type Phase = 'idle' | 'uploading' | 'analyzing'

/**
 * 06-U. 사진 업로드 · node 211:1584
 * 다중 선택(파일 피커) → 썸네일 그리드에서 선택 조정 → [AI 분석] 한 번으로
 * ① presign(POST /events/:id/photos/presign) ② S3 직접 PUT(목: MSW가 성공 처리)
 * ③ 분석 시작(POST /events/:id/analyze — 제외 토글 함께 전송) → 이벤트 상세(분석중)로 복귀.
 * 완료 확인은 재진입/새로고침(자동 폴링 없음 — MVP).
 */
export function PhotoUploadPage() {
  const { groupId = '', eventId = '' } = useParams<{ groupId: string; eventId: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  // 헤더 뒤로가기 라벨(‹ 이벤트명) + 분석중 진입 차단용
  const eventApi = useApi<EventItem>(`/events/${eventId}`)

  const [photos, setPhotos] = useState<PickedPhoto[]>([])
  // 품질 제외 토글 — 스펙 기본 ON. ON이면 해당 사진은 인물 앨범 대신 눈감음/흔들림 앨범으로 라우팅
  const [excludeEyesClosed, setExcludeEyesClosed] = useState(true)
  const [excludeBlurry, setExcludeBlurry] = useState(true)
  const [phase, setPhase] = useState<Phase>('idle')
  const [uploadedCount, setUploadedCount] = useState(0)
  const [uploadTotal, setUploadTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // 시도(attempt) 식별자 — 실패 후 곧바로 재시도할 때 이전 시도의 늦은 응답이 진행률을 건드리지 않게
  const attemptRef = useRef(0)

  // 언마운트 시 미리보기 URL 해제 — 최신 목록은 ref로 읽는다(cleanup은 한 번만 등록)
  const photosRef = useRef(photos)
  photosRef.current = photos
  useEffect(
    () => () => {
      for (const p of photosRef.current) URL.revokeObjectURL(p.previewUrl)
    },
    [],
  )

  // 제출 중 화면을 떠난 뒤 뒤늦게 온 응답이 상태 갱신·이동을 실행하지 않게 하는 플래그
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // 401 = 토큰 무효(apiFetch가 이미 지움) — 재시도해도 영원히 실패하므로 로그인으로 복귀
  if (eventApi.error?.status === 401) return <Navigate to="/login" replace />

  const event = eventApi.data
  const eventPath = `/groups/${groupId}/events/${eventId}`
  const selectedCount = photos.filter((p) => p.selected).length
  const busy = phase !== 'idle'

  const handlePick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // 같은 파일 재선택 허용(제거 후 다시 추가 등)
    if (files.length === 0) return
    // accept="image/*"는 피커 힌트일 뿐 — 비이미지(type 빈 문자열 포함)는 입구에서 걸러
    // presign의 image/* 검증(400)을 위장 우회하지 않는다
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (images.length < files.length)
      toast.show(`이미지가 아닌 파일 ${files.length - images.length}개는 제외했어요`)
    if (images.length === 0) return
    setPhotos((prev) => {
      const seen = new Set(prev.map((p) => p.key))
      const added = images
        .map((file) => ({ key: `${file.name}:${file.size}:${file.lastModified}`, file }))
        .filter(({ key }) => !seen.has(key))
        .map(({ key, file }) => ({
          key,
          file,
          previewUrl: URL.createObjectURL(file),
          selected: true,
          uploaded: false,
        }))
      return [...prev, ...added]
    })
  }

  const toggleSelected = (key: string) =>
    setPhotos((prev) => prev.map((p) => (p.key === key ? { ...p, selected: !p.selected } : p)))

  const handleAnalyze = async () => {
    const selected = photos.filter((p) => p.selected)
    if (selected.length === 0 || busy) return
    // 이미 업로드된 사진(이전 시도에서 ②까지 성공)은 다시 presign하지 않는다 —
    // presign이 곧 서버 등록인 계약에서 재시도가 사진을 중복 등록하는 것을 방지
    const toUpload = selected.filter((p) => !p.uploaded)
    const attempt = ++attemptRef.current
    // 시도 실패 시 진행 중이던 PUT을 끊는다 — 늦은 성공이 서버에 등록돼 다음 시도와 중복되지 않게
    const controller = new AbortController()
    setError(null)
    setUploadedCount(0)
    setUploadTotal(toUpload.length)
    setPhase(toUpload.length > 0 ? 'uploading' : 'analyzing')
    try {
      if (toUpload.length > 0) {
        // ① presign — 파일 메타만 JSON으로 보내고 파일별 업로드 URL을 받는다
        const { uploads } = await apiFetch<PresignResponse>(`/events/${eventId}/photos/presign`, {
          method: 'POST',
          body: {
            files: toUpload.map((p) => ({
              filename: p.file.name,
              contentType: p.file.type, // handlePick에서 image/*만 통과 — 위장 기본값 금지
              size: p.file.size,
            })),
          },
        })
        // ② S3 직접 PUT(병렬) — uploads는 요청 files와 같은 순서. 진행률은 시도 로컬 카운터로
        // (이전 시도의 늦은 응답이 새 시도의 카운터를 올리지 않게 attempt 일치 시에만 반영)
        let done = 0
        await Promise.all(
          uploads.map(async (upload, i) => {
            const res = await fetch(upload.uploadUrl, {
              method: upload.method,
              headers: upload.headers,
              body: toUpload[i].file,
              signal: controller.signal,
            })
            if (!res.ok)
              throw new ApiRequestError(
                res.status,
                'UPLOAD_FAILED',
                '사진 업로드에 실패했어요. 다시 시도해 주세요.',
              )
            // 성공한 업로드는 어느 시도든 기록 — 재시도 시 재업로드 대상에서 제외
            const key = toUpload[i].key
            setPhotos((prev) => prev.map((p) => (p.key === key ? { ...p, uploaded: true } : p)))
            done += 1
            if (alive.current && attemptRef.current === attempt) setUploadedCount(done)
          }),
        )
        if (!alive.current) return
        setPhase('analyzing')
      }
      // ③ 분석 시작 — 이벤트 status→analyzing, 완료는 이벤트 상세 재진입으로 확인
      await apiFetch<AnalysisJob>(`/events/${eventId}/analyze`, {
        method: 'POST',
        body: { excludeEyesClosed, excludeBlurry },
      })
      if (!alive.current) return
      toast.show('🧀 AI 분석을 시작했어요')
      navigate(eventPath)
    } catch (err) {
      controller.abort()
      if (!alive.current) return
      // 401 = 토큰 무효(apiFetch가 이미 지움) — 재시도는 영원히 실패하므로 로그인으로 복귀.
      // 단 S3 PUT의 401(UPLOAD_FAILED — presign URL 만료 등)은 세션과 무관하니 제외
      if (err instanceof ApiRequestError && err.status === 401 && err.code !== 'UPLOAD_FAILED') {
        navigate('/login', { replace: true })
        return
      }
      setError(toErrorMessage(err))
      setPhase('idle')
    }
  }

  return (
    <PhoneShell>
      <Header backTo={eventPath} backLabel={event?.name ?? '이벤트 상세'} backDisabled={busy} />
      <main className="flex flex-1 flex-col px-5 pb-9 pt-5">
        <h1 className="text-xl font-bold text-text">사진 업로드</h1>

        {!event ? (
          eventApi.loading ? (
            <p className="py-11 text-center text-sm text-muted">이벤트를 불러오는 중…</p>
          ) : eventApi.error ? (
            <div className="flex flex-col items-center gap-3 py-11">
              <p className="text-center text-sm text-warn">{toErrorMessage(eventApi.error)}</p>
              <Button size="sm" variant="secondary" onClick={eventApi.refetch}>
                다시 시도
              </Button>
            </div>
          ) : null
        ) : event.status === 'analyzing' ? (
          // 분석 중에는 업로드 불가(presign 400) — 진입 자체를 안내로 막는다
          <>
            <div className="mt-4 flex flex-col items-center rounded-[20px] bg-surface px-8 py-16 text-center">
              <span aria-hidden className="text-4xl">
                🤖
              </span>
              <p className="mt-3 text-sm text-muted">
                지금은 AI가 분석하고 있어요.
                <br />
                분석이 끝나면 사진을 추가할 수 있어요.
              </p>
            </div>
            <div className="mt-auto pt-6">
              <Button variant="secondary" fullWidth onClick={() => navigate(eventPath)}>
                이벤트로 돌아가기
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-3">
              <span className="inline-flex items-center rounded-full bg-primary/[.15] px-3 py-1 text-xs font-bold text-heading">
                선택됨 {selectedCount}장
              </span>
            </p>

            <div className="mt-3">
              <PhotoGrid>
                <button
                  type="button"
                  aria-label="사진 선택"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex aspect-square w-full items-center justify-center rounded-xl border-2 border-dashed border-border bg-white text-2xl text-muted disabled:opacity-50"
                >
                  ＋
                </button>
                {photos.map((p) => (
                  <PhotoTile
                    key={p.key}
                    src={p.previewUrl}
                    alt={p.file.name}
                    selectable
                    selected={p.selected}
                    onClick={() => {
                      if (!busy) toggleSelected(p.key)
                    }}
                  />
                ))}
              </PhotoGrid>
            </div>

            <div className="mt-5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3">
                <span className="text-sm font-medium text-text">눈감은 사진 제외</span>
                <Toggle
                  checked={excludeEyesClosed}
                  onChange={setExcludeEyesClosed}
                  disabled={busy}
                />
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3">
                <span className="text-sm font-medium text-text">흔들린 사진 제외</span>
                <Toggle checked={excludeBlurry} onChange={setExcludeBlurry} disabled={busy} />
              </div>
            </div>
            {/* 카피는 기능 명세 정정본 기준 — 제외 사진은 눈감음/흔들림 앨범으로 라우팅(08 참고) */}
            <p className="mt-2.5 text-xs leading-relaxed text-muted">
              제외한 사진은 &lsquo;눈감은 사진&rsquo;·&lsquo;흔들린 사진&rsquo; 사진첩으로 이동해요
            </p>

            {error ? (
              <p role="alert" className="mt-3 text-sm text-warn">
                {error}
              </p>
            ) : null}

            <div className="mt-auto pt-6">
              <Button fullWidth disabled={selectedCount === 0 || busy} onClick={handleAnalyze}>
                {phase === 'uploading'
                  ? `업로드 중… ${uploadedCount}/${uploadTotal}`
                  : phase === 'analyzing'
                    ? '분석 요청 중…'
                    : 'AI 분석'}
              </Button>
            </div>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={handlePick}
        />
      </main>
    </PhoneShell>
  )
}
