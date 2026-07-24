import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PhoneShell } from '../components/PhoneShell'
import {
  Button,
  Header,
  LoadState,
  PhotoGrid,
  PhotoTile,
  Toggle,
  useToast,
} from '../components/ui'
import { useAlive } from '../hooks/useAlive'
import { useApi } from '../hooks/useApi'
import { ApiRequestError, toErrorMessage } from '../api/client'
import { getEvent, presignUploads, registerPhotos, uploadToPresignedUrl } from '../api/events'
import { runWithConcurrency } from '../lib/concurrency'
import { createPreviewThumbnail } from '../lib/previewThumb'
import {
  isUploadableSize,
  MAX_UPLOAD_BATCH,
  MAX_UPLOAD_FILE_LABEL,
  UPLOAD_FORMAT_LABEL,
  uploadContentTypeOf,
} from '../lib/upload'

/** S3 PUT 동시 실행 수 — 브라우저의 호스트당 커넥션 한도(≈6)에 맞춘다 */
const UPLOAD_CONCURRENCY = 6
/** 미리보기 축소 동시 실행 수 — 디코드·캔버스가 CPU 작업이라 낮게 잡아 화면 멈춤을 피한다 */
const PREVIEW_CONCURRENCY = 2

/** 기기에서 고른 파일 + 미리보기 — key는 같은 파일 중복 추가 방지용 */
interface PickedPhoto {
  key: string
  file: File
  previewUrl: string
  selected: boolean
  /** S3 PUT 성공 시 받은 키 — 재시도할 때 다시 presign·업로드하지 않는다 */
  s3Key: string | null
  /** 서버 등록(③) 완료 — 재시도가 같은 사진을 두 번 등록하지 않게 */
  registered: boolean
}

/** 업로드 단계 — uploading은 presign+S3 PUT, registering은 등록(=분석 시작) 요청 */
type Phase = 'idle' | 'uploading' | 'registering'

/**
 * 06-U. 사진 업로드 · node 211:1584
 * 다중 선택(파일 피커) → 썸네일 그리드에서 선택 조정 → [사진 분류하기] 한 번으로
 * ① presign(POST /events/:id/photos/presign) ② presigned URL로 S3 직접 PUT
 * ③ 등록(POST /events/:id/photos — 제외 토글 함께 전송) → 이벤트 상세(분석중)로 복귀.
 * **등록이 곧 분석 시작**이라 analyze는 부르지 않는다(CHMO-194 — 부르면 같은 사진이 두 job으로 발행된다).
 * 완료 확인은 재진입/새로고침(자동 폴링 없음 — MVP).
 */
export function PhotoUploadPage() {
  const { groupId = '', eventId = '' } = useParams<{ groupId: string; eventId: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  // 헤더 뒤로가기 라벨(‹ 이벤트명) + 분석중 진입 차단용
  const eventApi = useApi(`event:${eventId}`, (signal) => getEvent(eventId, signal))

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

  const alive = useAlive()

  const event = eventApi.data
  const eventPath = `/groups/${groupId}/events/${eventId}`
  // 피커 분기(스크롤 밖 하단 CTA 액션바가 있는 상태) — 이때는 main이 아니라 바가 바닥 여백을 소유한다
  const showPicker = !!event && event.status !== 'analyzing'
  const selectedCount = photos.filter((p) => p.selected).length
  const overBatchLimit = selectedCount > MAX_UPLOAD_BATCH
  const busy = phase !== 'idle'

  const handlePick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // 같은 파일 재선택 허용(제거 후 다시 추가 등)
    if (files.length === 0) return
    // BE는 확장자로 Content-Type을 정하고, 화이트리스트 밖이거나 20MB를 넘는 파일이 하나라도 섞이면
    // presign 배치 전체를 400으로 거절한다 — 한 장 때문에 전부 실패하지 않게 입구에서 거른다.
    // accept="image/*"는 피커 힌트일 뿐이라 여기서 다시 확인한다.
    const supported = files.filter((f) => uploadContentTypeOf(f.name))
    const accepted = supported.filter((f) => isUploadableSize(f.size))
    const notices: string[] = []
    if (supported.length < files.length)
      notices.push(`${UPLOAD_FORMAT_LABEL}만 올릴 수 있어요(${files.length - supported.length}개 제외)`)
    if (accepted.length < supported.length)
      notices.push(
        `${MAX_UPLOAD_FILE_LABEL}가 넘는 사진 ${supported.length - accepted.length}개는 제외했어요`,
      )
    if (notices.length > 0) toast.show(notices.join(' · '))
    if (accepted.length === 0) return
    const seen = new Set(photos.map((p) => p.key))
    const added = accepted
      .map((file) => ({ key: `${file.name}:${file.size}:${file.lastModified}`, file }))
      .filter(({ key }) => !seen.has(key))
      .map(({ key, file }) => ({
        key,
        file,
        previewUrl: URL.createObjectURL(file),
        selected: true,
        s3Key: null,
        registered: false,
      }))
    if (added.length === 0) return
    setPhotos((prev) => [...prev, ...added])
    void shrinkPreviews(added)
  }

  /**
   * 원본 미리보기를 축소 썸네일로 순차 교체(CHMO-369) — 원본 수십 장을 타일에 그대로
   * 디코드하면 피커 복귀 직후 화면이 멈춘다. 축소 실패 항목은 원본 미리보기를 유지한다.
   */
  const shrinkPreviews = async (items: PickedPhoto[]) => {
    await runWithConcurrency(items, PREVIEW_CONCURRENCY, async ({ key, file }) => {
      const thumbUrl = await createPreviewThumbnail(file)
      if (!thumbUrl) return
      if (!alive.current) {
        URL.revokeObjectURL(thumbUrl)
        return
      }
      const original = photosRef.current.find((p) => p.key === key)?.previewUrl
      setPhotos((prev) => prev.map((p) => (p.key === key ? { ...p, previewUrl: thumbUrl } : p)))
      if (original) URL.revokeObjectURL(original)
    })
  }

  const toggleSelected = (key: string) =>
    setPhotos((prev) => prev.map((p) => (p.key === key ? { ...p, selected: !p.selected } : p)))

  const handleAnalyze = async () => {
    const selected = photos.filter((p) => p.selected)
    if (selected.length === 0 || overBatchLimit || busy) return
    // 이미 등록된 사진(이전 시도에서 ③까지 성공)은 제외 — 재시도가 사진을 중복 등록하지 않게.
    // 기준이 s3Key가 아니라 registered인 이유: presign·PUT은 서버 등록이 아니다(CHMO-194).
    const pending = selected.filter((p) => !p.registered)
    if (pending.length === 0) {
      navigate(eventPath)
      return
    }
    // 이전 시도에서 PUT까지 끝난 사진은 그 s3Key를 재사용한다(같은 파일을 두 번 올리지 않게)
    const toUpload = pending.filter((p) => !p.s3Key)
    const attempt = ++attemptRef.current
    // 시도 실패 시 진행 중이던 PUT을 끊는다 — 늦게 도착한 성공이 다음 시도와 뒤섞이지 않게
    const controller = new AbortController()
    setError(null)
    setUploadedCount(0)
    setUploadTotal(toUpload.length)
    setPhase(toUpload.length > 0 ? 'uploading' : 'registering')
    try {
      // 이번 시도에서 새로 받은 키(상태 반영은 비동기라 등록 단계는 이 맵을 본다)
      const freshKeys = new Map<string, string>()
      if (toUpload.length > 0) {
        // ① presign — 파일 메타(이름·크기)만 보내고 파일별 업로드 URL과 s3Key를 받는다
        const uploads = await presignUploads(
          eventId,
          toUpload.map((p) => ({ fileName: p.file.name, size: p.file.size })),
        )
        if (uploads.length !== toUpload.length)
          throw new ApiRequestError(
            502,
            'UPLOAD_FAILED',
            '업로드 URL을 받지 못했어요. 다시 시도해 주세요.',
          )
        // ② S3 직접 PUT — uploads는 요청 files와 같은 순서. 진행률은 시도 로컬 카운터로
        // (이전 시도의 늦은 응답이 새 시도의 카운터를 올리지 않게 attempt 일치 시에만 반영)
        let done = 0
        await runWithConcurrency(
          uploads,
          UPLOAD_CONCURRENCY,
          async (upload, i) => {
            const picked = toUpload[i]
            try {
              await uploadToPresignedUrl(upload, picked.file, controller.signal)
            } catch (err) {
              controller.abort() // 남은 PUT을 즉시 중단 — 고아 객체를 덜 남긴다
              throw err
            }
            // 성공한 업로드는 어느 시도든 기록 — 재시도 시 재업로드 대상에서 제외
            freshKeys.set(picked.key, upload.s3Key)
            setPhotos((prev) =>
              prev.map((p) => (p.key === picked.key ? { ...p, s3Key: upload.s3Key } : p)),
            )
            done += 1
            if (alive.current && attemptRef.current === attempt) setUploadedCount(done)
          },
          controller.signal,
        )
        if (!alive.current) return
        setPhase('registering')
      }
      // ③ 등록 — BE가 사진을 기록하고 이벤트를 analyzing으로 전이한 뒤 AI 분류를 발행한다.
      // 품질 제외 토글은 analyze가 아니라 이 호출에 실린다.
      const s3Keys = pending.map((p) => freshKeys.get(p.key) ?? p.s3Key)
      if (s3Keys.some((key) => !key))
        throw new ApiRequestError(500, 'UPLOAD_FAILED', '업로드가 끝나지 않은 사진이 있어요.')
      await registerPhotos(eventId, {
        s3Keys: s3Keys as string[],
        excludeEyesClosed,
        excludeBlurry,
      })
      if (!alive.current) return
      const registeredKeys = new Set(pending.map((p) => p.key))
      setPhotos((prev) =>
        prev.map((p) => (registeredKeys.has(p.key) ? { ...p, registered: true } : p)),
      )
      toast.show('🧀 사진 분류를 시작했어요')
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
      {/* 바닥 여백 소유가 분기별로 다르다 — 피커 분기는 스크롤 밖 하단 액션바가 pb-safe-9를 갖는다 */}
      <main
        className={`flex flex-1 flex-col overflow-y-auto px-5 pt-5 ${showPicker ? '' : 'pb-safe-9'}`}
      >
        <h1 className="text-xl font-bold text-text">사진 업로드</h1>

        {!event ? (
          <LoadState
            loading={eventApi.loading}
            error={eventApi.error}
            loadingText="이벤트를 불러오는 중…"
            onRetry={eventApi.refetch}
            unauthorizedTo="/login"
            notFoundTo={`/groups/${groupId}`}
            notFoundLabel="모임 상세로"
          />
        ) : event.status === 'analyzing' ? (
          // 분석 중에는 업로드 불가 — 진입 자체를 안내로 막는다
          <>
            <div className="mt-4 flex flex-col items-center rounded-[20px] bg-surface px-8 py-16 text-center">
              <span aria-hidden className="text-4xl">
                🤖
              </span>
              <p className="mt-3 text-sm text-muted">
                지금은 사진을 분류하고 있어요.
                <br />
                분류가 끝나면 사진을 추가할 수 있어요.
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
            {/* 카운트·품질 토글 — 업로드 전 설정이라 스크롤을 따라올 필요가 없어 일반 흐름에 둔다.
                CHMO-369의 상단 sticky는 철회: 실기기 WebKit에서 하단 CTA처럼 떠서 사진이 비쳤다(CHMO-424) */}
            <div className="pb-3 pt-3">
              <p>
                <span className="inline-flex items-center rounded-full bg-primary/[.15] px-3 py-1 text-xs font-bold text-heading">
                  선택됨 {selectedCount}장
                </span>
              </p>

              <div className="mt-3 flex flex-col gap-2.5">
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
            </div>

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

      {/* 하단 CTA는 스크롤 컨테이너 밖 고정 영역 — 셸이 h-dvh라 항상 보이고, 경고·에러도 버튼과
          함께 뜬다. 화면 안 sticky는 실기기 WebKit에서 상·하단 모두 떠서 사진이 비쳐 걷어냈다
          (CHMO-369의 sticky 철회, CHMO-424) */}
      {showPicker ? (
        <div className="px-5 pb-safe-9 pt-3">
          {overBatchLimit ? (
            <p role="alert" className="mb-2.5 text-sm text-warn">
              한 번에 {MAX_UPLOAD_BATCH}장까지 올릴 수 있어요.{' '}
              {selectedCount - MAX_UPLOAD_BATCH}장을 선택 해제해 주세요.
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="mb-2.5 text-sm text-warn">
              {error}
            </p>
          ) : null}

          <Button
            fullWidth
            disabled={selectedCount === 0 || overBatchLimit || busy}
            onClick={handleAnalyze}
          >
            {phase === 'uploading'
              ? `업로드 중… ${uploadedCount}/${uploadTotal}`
              : phase === 'registering'
                ? '분류 시작 중…'
                : '사진 분류하기'}
          </Button>
        </div>
      ) : null}
    </PhoneShell>
  )
}
