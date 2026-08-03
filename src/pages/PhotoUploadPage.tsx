import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { GuardianConsentDialog } from '../components/GuardianConsentDialog'
import { PhoneShell } from '../components/PhoneShell'
import { Button, Header, LoadState, PhotoGrid, PhotoTile, Toggle, useToast } from '../components/ui'
import { useAlive } from '../hooks/useAlive'
import { useApi } from '../hooks/useApi'
import { attestGuardianConsent } from '../api/agreements'
import { ApiRequestError, toErrorMessage } from '../api/client'
import { getEvent, presignUploads, registerPhotos, uploadToPresignedUrl } from '../api/events'
import { runWithConcurrency } from '../lib/concurrency'
import { createPreviewThumbnail } from '../lib/previewThumb'
import {
  isUploadableSize,
  MAX_UPLOAD_PICK,
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
  /** 축소 썸네일 blob URL — 준비 전엔 null이고 타일은 플레이스홀더를 보여준다(CHMO-497) */
  previewUrl: string | null
  selected: boolean
  /** S3 PUT 성공 시 받은 키 — 재시도할 때 다시 presign·업로드하지 않는다 */
  s3Key: string | null
  /** 서버 등록(③) 완료 — 재시도가 같은 사진을 두 번 등록하지 않게 */
  registered: boolean
}

/** 업로드 단계 — uploading은 presign+S3 PUT, registering은 등록(=분석 시작) 요청 */
type Phase = 'idle' | 'uploading' | 'registering'

/**
 * 등록(③) 실패가 진짜 실패인지 "응답만 유실"인지 서버에 되묻는다(CHMO-486).
 * 등록이 서버에 닿았다면 사진 수가 늘었거나 분석이 시작돼 있다 — 하나라도 움직였으면 성공으로 본다.
 * 확인 자체가 실패하면 판단을 보류하고 false를 돌려 평소 에러 경로를 타게 한다(오검출 방지).
 */
async function registrationLanded(eventId: string, photoCountBefore: number): Promise<boolean> {
  try {
    const latest = await getEvent(eventId)
    return (
      latest.photoCount > photoCountBefore ||
      latest.status === 'analyzing' ||
      latest.progress != null
    )
  } catch {
    return false
  }
}

/**
 * 06-U. 사진 업로드 · node 211:1584
 * **업로드·분류는 이벤트당 1회**(CHMO-486) — 사진이 이미 등록된 이벤트는 진입 자체를 막는다.
 * 08에 [＋ 사진 추가]가 없고 이 화면은 빈 이벤트에서만 열리지만, 딥링크·뒤로가기로도 들어올 수
 * 있어 화면이 직접 판정한다(서버 게이트는 CHMO-485).
 * 선택은 MAX_UPLOAD_PICK(100장)에서 캡 — 초과분은 해제 상태로 담고 안내만 한다(직접
 * 해제 강요 제거, CHMO-397). 이 상한은 **BE 계약 상한(500, 2026-07-28 실측)과 별개**로 웹이 스스로
 * 거는 값이다(CHMO-497) — 브라우저는 고른 파일을 전부 디코드해야 하고, 500장 규모는 앱의 네이티브
 * 업로드가 맡는다. 미리보기는 원본을 장당 1회만 디코드한다(타일에 원본을 꽂지 않는다).
 * 다중 선택(파일 피커) → 썸네일 그리드에서 선택 조정 → [사진 분류하기] 한 번으로
 * ① presign(POST /events/:id/photos/presign) ② presigned URL로 S3 직접 PUT
 * ③ 등록(POST /events/:id/photos — 제외 토글 함께 전송) → 이벤트 상세(분석중)로 복귀.
 * **등록이 곧 분석 시작**이라 analyze는 부르지 않는다(CHMO-194 — 부르면 같은 사진이 두 job으로 발행된다).
 * 완료 확인은 재진입/새로고침(자동 폴링 없음 — MVP).
 * ①에서 `AGREEMENT428`이 오면 이 모임의 보호자 동의 확보 확인이 없는 것이다(CHMO-516) —
 * 확인 모달 → 기록 → ①부터 재시도로 받는다(모임 단위·선생님별 1회라 다음 업로드엔 안 뜬다).
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
  // 보호자 동의 확보 확인 게이트(CHMO-516) — presign이 AGREEMENT428을 주면 모달로 확인받는다
  const [consentOpen, setConsentOpen] = useState(false)
  const [consentBusy, setConsentBusy] = useState(false)
  const [consentError, setConsentError] = useState<string | null>(null)
  // 미리보기 준비 소요(AC-5 기준선 측정용) — DEV에서만 화면에 노출한다
  const [previewTiming, setPreviewTiming] = useState<{ count: number; ms: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // 시도(attempt) 식별자 — 실패 후 곧바로 재시도할 때 이전 시도의 늦은 응답이 진행률을 건드리지 않게
  const attemptRef = useRef(0)

  // 언마운트 시 미리보기 URL 해제 — 최신 목록은 ref로 읽는다(cleanup은 한 번만 등록)
  const photosRef = useRef(photos)
  photosRef.current = photos
  useEffect(
    () => () => {
      for (const p of photosRef.current) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl)
    },
    [],
  )

  const alive = useAlive()

  const event = eventApi.data
  const eventPath = `/groups/${groupId}/events/${eventId}`
  // 분석 진행 판정 — analyzing 상태 또는 progress 존재. published 이벤트의 사진 추가는 상태
  // 전이 없는 증분 분석이라(CHMO-215·216) 상세 응답의 progress로만 진행을 알 수 있다(CHMO-442).
  const analysisActive = !!event && (event.status === 'analyzing' || event.progress != null)
  // 업로드는 이벤트당 1회(CHMO-486) — 분석 중이거나 이미 사진이 등록된 이벤트면 피커를 열지
  // 않는다. photoCount는 분석 커밋 시점에 올라가므로 분석중 판정과 함께 봐야 공백이 없다.
  const uploadLocked = !!event && (analysisActive || event.photoCount > 0)
  // 피커 분기(스크롤 밖 하단 CTA 액션바가 있는 상태) — 이때는 main이 아니라 바가 바닥 여백을 소유한다
  const showPicker = !!event && !uploadLocked
  const selectedCount = photos.filter((p) => p.selected).length
  const overBatchLimit = selectedCount > MAX_UPLOAD_PICK
  const busy = phase !== 'idle'

  const handlePick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // 같은 파일 재선택 허용(제거 후 다시 추가 등)
    if (files.length === 0) return
    // BE는 확장자로 Content-Type을 정하고, 화이트리스트 밖이거나 20MB를 넘는 파일이 하나라도 섞이면
    // presign 배치 전체를 400으로 거절한다 — 한 장 때문에 전부 실패하지 않게 입구에서 거른다.
    // accept는 피커 힌트일 뿐이라 여기서 다시 확인한다.
    const supported = files.filter((f) => uploadContentTypeOf(f.name))
    const accepted = supported.filter((f) => isUploadableSize(f.size))
    const notices: string[] = []
    if (supported.length < files.length)
      notices.push(
        `${UPLOAD_FORMAT_LABEL}만 올릴 수 있어요(${files.length - supported.length}개 제외)`,
      )
    if (accepted.length < supported.length)
      notices.push(
        `${MAX_UPLOAD_FILE_LABEL}가 넘는 사진 ${supported.length - accepted.length}개는 제외했어요`,
      )
    if (accepted.length === 0) {
      if (notices.length > 0) toast.show(notices.join(' · '))
      return
    }
    const seen = new Set(photos.map((p) => p.key))
    // 상한 캡(CHMO-397) — 남은 슬롯까지만 선택 상태로 담고 초과분은 해제 상태로 추가한다.
    // 사용자가 타일을 직접 해제하지 않아도 바로 진행할 수 있고, 원하면 바꿔 담을 수 있다.
    const remainingSlots = Math.max(0, MAX_UPLOAD_PICK - selectedCount)
    const added = accepted
      .map((file) => ({ key: `${file.name}:${file.size}:${file.lastModified}`, file }))
      .filter(({ key }) => !seen.has(key))
      .map(({ key, file }, i) => ({
        key,
        file,
        // 원본 objectURL을 여기서 만들지 않는다(CHMO-497) — 꽂는 순간 브라우저가 고른 원본을
        // 전부 디코드해 첫 페인트가 멈춘다. 타일은 썸네일이 올 때까지 플레이스홀더로 둔다.
        previewUrl: null,
        selected: i < remainingSlots,
        s3Key: null,
        registered: false,
      }))
    if (added.length > remainingSlots)
      notices.push(`한 번에 ${MAX_UPLOAD_PICK}장까지 올릴 수 있어요`)
    if (notices.length > 0) toast.show(notices.join(' · '))
    if (added.length === 0) return
    setPhotos((prev) => [...prev, ...added])
    void buildPreviews(added)
  }

  /**
   * 플레이스홀더 타일을 축소 썸네일로 채운다(CHMO-369 · CHMO-497).
   * 원본은 여기서 **딱 한 번** 디코드된다 — 타일에 원본을 꽂지 않으므로 브라우저가 따로
   * 디코드할 일이 없다. 썸네일을 못 만든 파일만 원본 objectURL로 폴백한다(미리보기 공백 방지).
   */
  const buildPreviews = async (items: PickedPhoto[]) => {
    const startedAt = performance.now()
    await runWithConcurrency(items, PREVIEW_CONCURRENCY, async ({ key, file }) => {
      const previewUrl = (await createPreviewThumbnail(file)) ?? URL.createObjectURL(file)
      if (!alive.current) {
        URL.revokeObjectURL(previewUrl)
        return
      }
      setPhotos((prev) => prev.map((p) => (p.key === key ? { ...p, previewUrl } : p)))
    })
    // AC-5 기준선 — 실기기(모바일 사파리)는 콘솔을 붙이기 어려워 화면에 띄운다(DEV에서만 렌더)
    if (alive.current)
      setPreviewTiming({ count: items.length, ms: Math.round(performance.now() - startedAt) })
  }

  const toggleSelected = (key: string) => {
    const target = photos.find((p) => p.key === key)
    if (!target) return
    // 캡 도달 상태에서 새로 선택하려는 탭 — 상한을 넘기지 말고 안내만(CHMO-397).
    // 여기서 막아야 CTA가 '초과로 비활성' 상태로 되돌아갈 일이 없다.
    if (!target.selected && selectedCount >= MAX_UPLOAD_PICK) {
      toast.show(`한 번에 ${MAX_UPLOAD_PICK}장까지 올릴 수 있어요`)
      return
    }
    setPhotos((prev) => prev.map((p) => (p.key === key ? { ...p, selected: !p.selected } : p)))
  }

  const handleAnalyze = async () => {
    const selected = photos.filter((p) => p.selected)
    if (selected.length === 0 || overBatchLimit || busy) return
    // 이미 등록된 사진(이전 시도에서 ③까지 성공)은 제외 — 재시도가 사진을 중복 등록하지 않게.
    // 기준이 s3Key가 아니라 registered인 이유: presign·PUT은 서버 등록이 아니다(CHMO-194).
    const pending = selected.filter((p) => !p.registered)
    if (pending.length === 0) {
      navigate(eventPath, { replace: true })
      return
    }
    // 이전 시도에서 PUT까지 끝난 사진은 그 s3Key를 재사용한다(같은 파일을 두 번 올리지 않게)
    const toUpload = pending.filter((p) => !p.s3Key)
    const attempt = ++attemptRef.current
    // 시도 실패 시 진행 중이던 PUT을 끊는다 — 늦게 도착한 성공이 다음 시도와 뒤섞이지 않게
    const controller = new AbortController()
    // 등록 실패 시 "서버에 실제로 등록됐는지" 판정 기준(아래 catch) — 요청 전 사진 수를 잡아 둔다
    const photoCountBefore = event?.photoCount ?? 0
    let registerAttempted = false
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
      registerAttempted = true
      const registered = await registerPhotos(eventId, {
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
      // '분석 시작' 킥(CHMO-443) — 등록 직후엔 AI 첫 진행률 메시지 전이라 progress가 잠깐 null이고,
      // 상세의 단발 조회가 분석 시작을 놓칠 수 있다. 1회 정책으로 업로드는 empty 이벤트에서만
      // 일어나 status만으로 판정될 여지가 생겼지만, 등록 응답 시점에 analyzing이 보장되는지는
      // 실 BE로 확인 전이라 킥을 유지한다(확인 후 정리 — CHMO-486 범위).
      // expected는 완료 판정용: 사진은 분석 커밋 시점에야 photoCount에 반영된다(실서버 실측).
      // replace — 업로드가 끝난 06-U는 다시 열 수 없는 화면이라(1회 정책) 히스토리에 남기지
      // 않는다. 남기면 이벤트 상세에서 뒤로가기가 '이미 올렸어요' 안내로 떨어진다(CHMO-486)
      navigate(eventPath, {
        replace: true,
        state: {
          analysisKick: {
            eventId,
            expected: (event?.photoCount ?? 0) + registered.registeredCount,
          },
        },
      })
    } catch (err) {
      controller.abort()
      if (!alive.current) return
      // 401 = 토큰 무효(apiFetch가 이미 지움) — 재시도는 영원히 실패하므로 로그인으로 복귀.
      // 단 S3 PUT의 401(UPLOAD_FAILED — presign URL 만료 등)은 세션과 무관하니 제외
      if (err instanceof ApiRequestError && err.status === 401 && err.code !== 'UPLOAD_FAILED') {
        navigate('/login', { replace: true })
        return
      }
      // 이 모임의 보호자 동의 확보 확인이 아직 없다(CHMO-516) — 실패가 아니라 조건이 빈 것이라
      // 에러 문구 대신 확인 모달을 띄운다. ① presign에서 걸리므로 S3에 올라간 파일이 없어
      // 확인 뒤 처음부터 다시 시도해도 중복 업로드가 없다(사진 선택도 그대로 남는다).
      if (err instanceof ApiRequestError && err.code === 'GUARDIAN_CONSENT_REQUIRED') {
        setConsentError(null)
        setConsentOpen(true)
        setPhase('idle')
        return
      }
      // 등록 요청은 서버에 닿았는데 응답만 유실됐을 수 있다(타임아웃·통신 끊김·앱 전환).
      // 업로드가 이벤트당 1회라 재시도는 서버가 거부하고(CHMO-485) 화면이 "실패"로 굳는다 —
      // 실제로 등록·분류가 시작됐으면 에러 대신 상세로 인계한다(CHMO-486).
      if (registerAttempted && (await registrationLanded(eventId, photoCountBefore))) {
        if (!alive.current) return
        toast.show('🧀 사진 분류를 시작했어요')
        navigate(eventPath, { replace: true })
        return
      }
      if (!alive.current) return
      setError(toErrorMessage(err))
      setPhase('idle')
    }
  }

  /**
   * 확인 기록(POST /groups/:id/agreements) → 업로드 재시도.
   * 확인은 모임 단위·선생님별 1회라 이 모임의 다음 업로드엔 모달이 뜨지 않는다.
   */
  const handleConsentConfirm = async () => {
    if (consentBusy) return
    setConsentBusy(true)
    setConsentError(null)
    try {
      await attestGuardianConsent(groupId)
      if (!alive.current) return
      setConsentBusy(false)
      setConsentOpen(false)
      // 사진 선택·품질 토글은 그대로라 확인 직후 원래 하려던 업로드를 이어서 시작한다
      void handleAnalyze()
    } catch (err) {
      if (!alive.current) return
      if (err instanceof ApiRequestError && err.status === 401) {
        navigate('/login', { replace: true })
        return
      }
      // 모달을 닫지 않는다 — 여기서 바로 다시 시도하는 게 자연스럽다
      setConsentBusy(false)
      setConsentError(toErrorMessage(err))
    }
  }

  return (
    <PhoneShell>
      {/* 헤더 ‹ 도 replace — 06-U는 히스토리에 남지 않는 지나가는 화면이라는 규칙을 여기서도
          지킨다(Link는 push라 backTo 대신 onBack). 안 그러면 06-E에서 뒤로가면 06-U로 되돌아온다 */}
      <Header
        onBack={() => navigate(eventPath, { replace: true })}
        backLabel={event?.name ?? '이벤트 상세'}
        backDisabled={busy}
      />
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
            notFoundLabel="모임으로"
          />
        ) : uploadLocked ? (
          // 업로드 불가(분석중 또는 1회 소진) — 안내 화면 대신 이벤트 상세로 곧장 넘긴다.
          // 여기서 할 수 있는 일이 '돌아가기' 하나뿐이라 화면을 띄우면 뒤로가기가 막다른 길에
          // 부딪히는 느낌만 준다. replace라 히스토리에도 남지 않아 뒤로가기가 헛돌지 않는다.
          // 이벤트 상세가 분석중·앨범 그리드를 알아서 갈라 보여주므로 안내도 그쪽이 더 정확하다.
          <Navigate to={eventPath} replace />
        ) : (
          <>
            {/* 카운트·품질 토글 — 업로드 전 설정이라 스크롤을 따라올 필요가 없어 일반 흐름에 둔다.
                CHMO-369의 상단 sticky는 철회: 실기기 WebKit에서 하단 CTA처럼 떠서 사진이 비쳤다(CHMO-424) */}
            <div className="pb-3 pt-3">
              {/* 아동 사진 고지 배너(CHMO-478) — 얼굴 인식 처리 사실 + 보호자 동의 전제 안내 */}
              <p className="mb-3 rounded-2xl bg-surface px-4 py-3 text-xs leading-relaxed text-muted">
                업로드한 사진은 얼굴 인식으로 인물별 분류됩니다. 보호자 동의를 받은 아이의 사진만
                올려 주세요.
              </p>
              <p className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center rounded-full bg-primary/[.15] px-3 py-1 text-xs font-bold text-heading">
                  선택됨 {selectedCount}장
                </span>
                {/* 상한 사전 고지 — 선택 전부터 상시 보인다(CHMO-397) */}
                <span className="text-xs text-muted">한 번에 최대 {MAX_UPLOAD_PICK}장</span>
              </p>
              {/* 미리보기 준비 시간(AC-5, CHMO-497) — 실기기 기준선 측정용이라 DEV에서만 */}
              {import.meta.env.DEV && previewTiming ? (
                <p className="mt-1 text-[11px] text-muted">
                  [DEV] 미리보기 {previewTiming.count}장 준비 {previewTiming.ms}ms
                </p>
              ) : null}
              {/* 캡으로 해제 상태 사진이 남았을 때만. 업로드는 이벤트당 1회라 "다음에 이어
                  올리세요"는 거짓 안내가 된다(CHMO-486) — 지금 못 올린다는 사실을 그대로 알린다 */}
              {selectedCount >= MAX_UPLOAD_PICK && photos.some((p) => !p.selected) && (
                <p className="mt-2 text-xs font-bold leading-relaxed text-heading">
                  선택되지 않은 사진은 올라가지 않아요 — 업로드는 이벤트당 한 번이라 지금 올릴
                  사진을 모두 골라 주세요
                </p>
              )}

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
                제외한 사진은 &lsquo;눈감은 사진&rsquo;·&lsquo;흔들린 사진&rsquo; 사진첩으로
                이동해요
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
                  // 썸네일 준비 전엔 undefined — PhotoTile이 치즈 도트 플레이스홀더를 보여준다
                  src={p.previewUrl ?? undefined}
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
          // .heic 명시가 없으면 iOS가 피커 안에서 HEIC→JPEG 변환을 돌려, 수십 장이면 수십 초간
          // 피커가 멈춘 듯 보인다(CHMO-370). 원본 HEIC를 그대로 받는 대신 미리보기 타일은
          // Safari 계열에서만 렌더된다 — HEIC를 고르는 기기는 사실상 아이폰뿐이라 실영향 작음.
          // .heif는 넣지 않는다: FE·BE 화이트리스트(src/lib/upload.ts)가 heic만 받는다.
          accept="image/*,.heic"
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
          {/* 정상 경로에선 도달 불가 — 선택이 상한에서 캡된다(CHMO-397). 회귀 대비 방어선으로만 남긴다 */}
          {overBatchLimit ? (
            <p role="alert" className="mb-2.5 text-sm text-warn">
              한 번에 {MAX_UPLOAD_PICK}장까지 올릴 수 있어요. {selectedCount - MAX_UPLOAD_PICK}장을
              선택 해제해 주세요.
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

      {/* 업로드 게이트 — 닫으면(나중에) 사진 선택 상태가 그대로 남아 다시 [사진 분류하기]를 누를 수 있다 */}
      <GuardianConsentDialog
        open={consentOpen}
        busy={consentBusy}
        error={consentError}
        onConfirm={handleConsentConfirm}
        onClose={() => {
          if (!consentBusy) setConsentOpen(false)
        }}
      />
    </PhoneShell>
  )
}
