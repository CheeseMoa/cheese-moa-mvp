import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ApiRequestError, toErrorMessage } from '../../api/client'
import { useApi } from '../../hooks/useApi'
import { useAlive } from '../../hooks/useAlive'
import { useMutation } from '../../hooks/useMutation'
import { isPopupSurveyForm } from '../../lib/popupSurvey'
import {
  createAdminPopup,
  getAdminPopup,
  presignAdminPopupImage,
  putAdminPopupImage,
  updateAdminPopup,
} from '../api/admin'
import type {
  AdminPopup,
  AdminPopupAudience,
  AdminPopupInput,
  AdminPopupLinkTarget,
  AdminPopupLocale,
} from '../api/types'
import { AdminTopbar } from '../components/AdminTopbar'
import { AdminErrorMessage, AdminMessage } from '../components/AdminMessage'
import {
  AdminNotice,
  AdminSwitch,
  ChoiceGroup,
  Field,
  FormSection,
} from '../components/AdminForm'
import { inputClassName, textareaClassName } from '../lib/formStyles'
import { PopupPhonePreview } from '../components/PopupPhonePreview'
import { PopupStatusBadge } from '../components/StatusBadge'
import {
  formatCount,
  linkHost,
  popupLinkTargetLabel,
} from '../lib/format'
import {
  POPUP_IMAGE_MAX_BYTES,
  POPUP_IMAGE_TYPES,
  POPUP_LIMITS,
  dateToKstInput,
  isHttpsLink,
  isOffPopupRatio,
  isValidAppVersion,
  isoToKstInput,
  kstInputToIso,
} from '../lib/promotion'

/** 작성 중인 값 — 입력칸 그대로(숫자·시각도 문자열)이고 저장할 때 계약 형태로 바꾼다 */
interface PopupDraft {
  title: string
  /** 올린 이미지 — 서버 키 + 미리보기 URL(방금 올렸으면 로컬 object URL, 아니면 presigned GET) */
  image: { key: string; url: string; bytes: number | null } | null
  imageAlt: string
  ctaLabel: string
  linkUrl: string
  linkTarget: AdminPopupLinkTarget
  audience: AdminPopupAudience
  locale: AdminPopupLocale
  /** KST `datetime-local` 값 */
  startsLocal: string
  endsLocal: string
  priority: string
  hideToday: boolean
  active: boolean
  minAppVersion: string
}

type DraftField = keyof PopupDraft

/** 오류 칸을 찾아가는 순서(화면 위→아래)와 그 칸의 요소 id — 이미지는 입력칸 대신 영역으로 */
const FIELD_ORDER: DraftField[] = [
  'title',
  'image',
  'imageAlt',
  'ctaLabel',
  'linkUrl',
  'startsLocal',
  'endsLocal',
  'priority',
  'minAppVersion',
]
const FIELD_ELEMENT_IDS: Record<string, string> = {
  title: 'popup-title',
  image: 'popup-image',
  imageAlt: 'popup-alt',
  ctaLabel: 'popup-cta',
  linkUrl: 'popup-link',
  startsLocal: 'popup-starts',
  endsLocal: 'popup-ends',
  priority: 'popup-priority',
  minAppVersion: 'popup-version',
}

const AUDIENCE_CHOICES: { value: AdminPopupAudience; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'ORGANIZATION', label: '선생님 계정' },
  { value: 'PERSONAL', label: '개인 계정' },
]

const LOCALE_CHOICES: { value: AdminPopupLocale; label: string }[] = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
]

const LINK_TARGET_CHOICES: { value: AdminPopupLinkTarget; label: string }[] = [
  { value: 'IN_APP', label: popupLinkTargetLabel('IN_APP') },
  { value: 'EXTERNAL', label: popupLinkTargetLabel('EXTERNAL') },
]

/** 새 팝업 기본 기간 — 다음 정시부터 7일 뒤 23:59(KST). 비워 두면 매번 같은 값을 손으로 친다 */
function defaultPeriod(): { startsLocal: string; endsLocal: string } {
  const hour = 60 * 60 * 1000
  const start = Math.ceil(Date.now() / hour) * hour
  const end = dateToKstInput(new Date(start + 7 * 24 * hour))
  return { startsLocal: dateToKstInput(new Date(start)), endsLocal: `${end.slice(0, 10)}T23:59` }
}

function emptyDraft(): PopupDraft {
  return {
    title: '',
    image: null,
    imageAlt: '',
    ctaLabel: '',
    linkUrl: '',
    linkTarget: 'IN_APP',
    audience: 'ALL',
    locale: 'ko',
    ...defaultPeriod(),
    priority: '0',
    hideToday: true,
    active: true,
    minAppVersion: '',
  }
}

function draftFrom(popup: AdminPopup, duplicate: boolean): PopupDraft {
  return {
    title: duplicate ? `${popup.title} 사본`.slice(0, POPUP_LIMITS.title) : popup.title,
    image: { key: popup.imageKey, url: popup.imageUrl, bytes: null },
    imageAlt: popup.imageAlt,
    ctaLabel: popup.ctaLabel ?? '',
    linkUrl: popup.linkUrl,
    linkTarget: popup.linkTarget,
    audience: popup.audience,
    locale: popup.locale,
    startsLocal: isoToKstInput(popup.startsAt),
    endsLocal: isoToKstInput(popup.endsAt),
    priority: String(popup.priority),
    hideToday: popup.hideOption === 'TODAY',
    active: popup.active,
    minAppVersion: popup.minAppVersion ?? '',
  }
}

/**
 * 저장 전 검사 — BE와 같은 규칙(admin/lib/promotion)으로 **무엇이 틀렸는지** 칸마다 말한다.
 * 서버는 같은 위반을 뭉뚱그린 POPUP400 하나로 준다.
 */
function validate(draft: PopupDraft): Partial<Record<DraftField, string>> {
  const errors: Partial<Record<DraftField, string>> = {}
  if (!draft.title.trim()) errors.title = '관리용 이름을 적어 주세요.'
  else if (draft.title.length > POPUP_LIMITS.title) errors.title = '100자 이하로 줄여 주세요.'

  if (!draft.image) errors.image = '이미지를 올려 주세요.'

  if (!draft.imageAlt.trim()) errors.imageAlt = '이미지 대신 읽어 줄 문구를 적어 주세요.'
  else if (draft.imageAlt.length > POPUP_LIMITS.imageAlt) errors.imageAlt = '500자 이하로 줄여 주세요.'

  if (draft.ctaLabel.length > POPUP_LIMITS.ctaLabel) errors.ctaLabel = '50자 이하로 줄여 주세요.'

  const link = draft.linkUrl.trim()
  if (!link) errors.linkUrl = '눌렀을 때 열 주소를 적어 주세요.'
  else if (/^http:\/\//i.test(link)) errors.linkUrl = 'http 주소는 쓸 수 없어요 · https로 바꿔 주세요.'
  else if (!isHttpsLink(link)) {
    errors.linkUrl = 'https://로 시작하는 웹 주소만 쓸 수 있어요(공백·앱 주소 불가).'
  }

  const starts = kstInputToIso(draft.startsLocal)
  const ends = kstInputToIso(draft.endsLocal)
  if (!starts) errors.startsLocal = '시작 시각을 골라 주세요.'
  if (!ends) errors.endsLocal = '끝나는 시각을 골라 주세요.'
  else if (starts && new Date(ends) <= new Date(starts)) {
    errors.endsLocal = '끝나는 시각이 시작보다 뒤여야 해요.'
  }

  const priority = Number(draft.priority)
  if (draft.priority.trim() === '' || !Number.isInteger(priority) || Math.abs(priority) > 2 ** 31 - 1) {
    errors.priority = '정수로 적어 주세요.'
  }

  const version = draft.minAppVersion.trim()
  if (version && !isValidAppVersion(version)) {
    errors.minAppVersion = '2.7.0처럼 숫자 세 마디로 적어 주세요.'
  }
  return errors
}

/**
 * 이벤트 팝업 작성·수정 (CHMO-928 — BE CHMO-926) · `/admin/popups/new`(복제는 `?from=:id`) ·
 * `/admin/popups/:popupId`.
 *
 * 오른쪽 폰 미리보기는 앱 팝업과 같은 배치라(PopupPhonePreview) 4:5가 아닌 이미지는 앱에서
 * 잘리는 그대로 잘려 보인다. 이미지는 고르는 즉시 올린다(presign → S3 PUT) — 저장 때 서버가 키를
 * S3에서 확인하므로 업로드가 먼저여야 하고, 미리 올려 두면 [저장]이 빠르다.
 *
 * 수정은 popupId를 유지한다 — 그래서 앱에서 이미 숨긴 사람에게는 고친 내용도 안 보인다. 다시
 * 보여 주려면 새로 만들어야 해서, 수정 화면은 [복제해서 새로 만들기]를 안내와 함께 둔다.
 */
export function AdminPopupEditPage() {
  const navigate = useNavigate()
  const { popupId } = useParams()
  const [searchParams] = useSearchParams()
  const duplicateFrom = popupId ? null : searchParams.get('from')
  const sourceId = popupId ?? duplicateFrom
  const isEdit = Boolean(popupId)

  const source = useApi(sourceId ? `admin-popup:${sourceId}` : null, (signal) =>
    getAdminPopup(sourceId as string, signal),
  )

  // 원본이 도착하면 한 번만 폼에 옮긴다(재조회로 덮어쓰면 고치던 내용이 날아간다)
  const [draft, setDraft] = useState<PopupDraft | null>(() => (sourceId ? null : emptyDraft()))
  useEffect(() => {
    if (source.data && draft === null) setDraft(draftFrom(source.data, !isEdit))
  }, [source.data, draft, isEdit])

  if (sourceId && source.error) {
    return (
      <>
        <EditTopbar isEdit={isEdit} popup={null} />
        <div className="px-7 py-6">
          <AdminErrorMessage
            error={source.error}
            onRetry={source.error.status === 404 ? undefined : source.refetch}
          />
          <Link
            to="/admin/popups"
            className="mt-3 inline-block text-[13px] text-admin-muted hover:text-admin-text hover:underline"
          >
            ‹ 팝업 목록으로
          </Link>
        </div>
      </>
    )
  }

  if (!draft) {
    return (
      <>
        <EditTopbar isEdit={isEdit} popup={null} />
        <div className="px-7 py-6">
          <AdminMessage text="불러오는 중이에요…" />
        </div>
      </>
    )
  }

  return (
    <PopupForm
      key={sourceId ?? 'new'}
      initial={draft}
      editing={isEdit ? (source.data ?? null) : null}
      onDone={(message) => navigate('/admin/popups', { state: { toast: message } })}
    />
  )
}

function EditTopbar({ isEdit, popup }: { isEdit: boolean; popup: AdminPopup | null }) {
  return (
    <AdminTopbar
      left={
        <>
          <Link to="/admin/popups" className="text-admin-muted hover:text-admin-text">
            이벤트 팝업
          </Link>
          <span className="text-admin-muted">›</span>
          <span>{isEdit ? (popup ? popup.title : '팝업 수정') : '새 팝업'}</span>
          {popup ? <PopupStatusBadge status={popup.status} /> : null}
        </>
      }
      right={popup ? `#${popup.popupId}` : undefined}
    />
  )
}

function PopupForm({
  initial,
  editing,
  onDone,
}: {
  initial: PopupDraft
  /** 수정 중인 원본 — 새로 만들기·복제는 null */
  editing: AdminPopup | null
  onDone: (toast: string) => void
}) {
  const alive = useAlive()
  const mutate = useMutation()
  const [draft, setDraft] = useState(initial)
  const [touched, setTouched] = useState<Partial<Record<DraftField, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const set = <K extends DraftField>(field: K, value: PopupDraft[K]) =>
    setDraft((prev) => ({ ...prev, [field]: value }))
  const touch = (field: DraftField) => setTouched((prev) => ({ ...prev, [field]: true }))

  const errors = useMemo(() => validate(draft), [draft])
  /** 칸을 한 번 떠났거나 저장을 눌렀을 때만 오류를 보인다 — 치는 도중 붉은 글이 따라오지 않게 */
  const errorOf = (field: DraftField) =>
    submitted || touched[field] ? (errors[field] ?? null) : null

  // ── 이미지 ──
  const [uploading, setUploading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)
  const objectUrls = useRef<string[]>([])
  useEffect(() => {
    const urls = objectUrls.current
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  const upload = async (file: File) => {
    setImageError(null)
    if (!(POPUP_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      setImageError('JPG·PNG만 올릴 수 있어요.')
      return
    }
    if (file.size > POPUP_IMAGE_MAX_BYTES) {
      setImageError('10MB 이하만 올릴 수 있어요.')
      return
    }
    setUploading(true)
    try {
      const target = await presignAdminPopupImage(file)
      await putAdminPopupImage(target.uploadUrl, file)
      if (!alive.current) return
      const url = URL.createObjectURL(file)
      objectUrls.current.push(url)
      setImageSize(null)
      set('image', { key: target.key, url, bytes: file.size })
    } catch (err) {
      if (!alive.current) return
      setImageError(
        err instanceof ApiRequestError
          ? toErrorMessage(err)
          : '이미지를 올리지 못했어요 · 다시 시도해 주세요.',
      )
    } finally {
      if (alive.current) setUploading(false)
    }
  }

  const fileInput = useRef<HTMLInputElement>(null)
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && !uploading && !saving) void upload(file)
  }

  // ── 저장 ──
  const submit = async () => {
    setSubmitted(true)
    setFormError(null)
    const firstInvalid = FIELD_ORDER.find((field) => errors[field])
    if (firstInvalid) {
      // 막힌 이유가 화면 밖(긴 폼의 위쪽)이면 [만들기]가 아무 반응 없는 버튼처럼 읽힌다
      const target = document.getElementById(FIELD_ELEMENT_IDS[firstInvalid])
      target?.scrollIntoView({ block: 'center' })
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        target.focus({ preventScroll: true })
      }
      return
    }
    if (uploading || !draft.image) return

    const starts = kstInputToIso(draft.startsLocal) as string
    const ends = kstInputToIso(draft.endsLocal) as string
    const input: AdminPopupInput = {
      title: draft.title.trim(),
      imageKey: draft.image.key,
      imageAlt: draft.imageAlt.trim(),
      ctaLabel: draft.ctaLabel.trim() || null,
      linkUrl: draft.linkUrl.trim(),
      linkTarget: draft.linkTarget,
      audience: draft.audience,
      locale: draft.locale,
      // 손대지 않은 시각은 원본 그대로 보낸다 — 입력칸은 분 단위라 23:59:59가 23:59:00으로 깎인다
      startsAt:
        editing && draft.startsLocal === isoToKstInput(editing.startsAt) ? editing.startsAt : starts,
      endsAt: editing && draft.endsLocal === isoToKstInput(editing.endsAt) ? editing.endsAt : ends,
      priority: Number(draft.priority),
      hideOption: draft.hideToday ? 'TODAY' : 'NONE',
      active: draft.active,
      minAppVersion: draft.minAppVersion.trim() || null,
    }

    setSaving(true)
    await mutate(
      () => (editing ? updateAdminPopup(editing.popupId, input) : createAdminPopup(input)),
      {
        noAuthRedirect: true,
        onSuccess: (saved) => {
          setSaving(false)
          onDone(
            editing
              ? `'${saved.title}' 팝업을 저장했어요.`
              : `'${saved.title}' 팝업을 만들었어요${saved.active ? '' : ' · 꺼 둔 상태예요'}.`,
          )
        },
        onError: (message, err) => {
          setSaving(false)
          const status = err instanceof ApiRequestError ? err.status : 0
          if (status === 404) {
            setFormError('이미 지워진 팝업이에요 · 목록에서 새로 만들어 주세요.')
            return
          }
          if (err instanceof ApiRequestError && err.code === 'INVALID_POPUP') {
            // 화면 검사를 통과했는데 서버가 거부했다 — 대개 이미지(업로드 만료·누락)다
            setFormError(
              '서버가 저장을 거부했어요 · 이미지를 다시 올리거나 링크·기간·버전을 확인해 주세요.',
            )
            return
          }
          setFormError(message)
        },
      },
    )
  }

  const nowMs = Date.now()
  const endsIso = kstInputToIso(draft.endsLocal)
  const endedAlready = endsIso !== null && new Date(endsIso).getTime() <= nowMs
  const offRatio = imageSize ? isOffPopupRatio(imageSize.width, imageSize.height) : false
  const busy = saving || uploading

  return (
    <>
      <EditTopbar isEdit={Boolean(editing)} popup={editing} />
      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
        {/* 1440 기준 2단 — 좁으면(1280 미만) 미리보기가 폼 아래로 내려간다(어드민 최소 폭 1024) */}
        <div className="flex flex-col gap-8 xl:flex-row xl:items-start">
          <form
            className="min-w-0 max-w-[640px] flex-1 space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
            noValidate
          >
            <AdminNotice
              title="저장하기 전에"
              lines={[
                <>앱 <b className="font-semibold">2.7.0 이상</b>에서만 보여요.</>,
                '링크를 연 사람에게는 이 팝업이 기간이 끝날 때까지 다시 뜨지 않아요.',
                '구독·이용권을 웹 결제로 안내하는 링크는 스토어 정책 위반이에요.',
                ...(editing
                  ? [
                      <>
                        내용을 고쳐도 이미 '오늘 하루 보지 않기'를 누른 사람에게는 오늘 안 보여요. 다시
                        보이게 하려면 새 팝업으로 만들어 주세요.{' '}
                        <Link
                          to={`/admin/popups/new?from=${editing.popupId}`}
                          className="font-semibold underline underline-offset-2"
                        >
                          복제해서 새로 만들기
                        </Link>
                      </>,
                    ]
                  : []),
              ]}
            />

            <FormSection title="기본">
              <Field
                label="관리용 이름"
                htmlFor="popup-title"
                error={errorOf('title')}
                hint="목록에서 알아보는 이름이에요 · 앱에는 나가지 않아요."
                count={{ value: draft.title.length, max: POPUP_LIMITS.title }}
              >
                <input
                  id="popup-title"
                  value={draft.title}
                  onChange={(e) => set('title', e.target.value)}
                  onBlur={() => touch('title')}
                  placeholder="예) 10월 사용 설문"
                  className={inputClassName(Boolean(errorOf('title')))}
                />
              </Field>
            </FormSection>

            <FormSection title="이미지">
              <Field
                label="팝업 이미지"
                error={imageError ?? errorOf('image')}
                hint="JPG·PNG · 10MB 이하 · 4:5 비율(1080×1350) 권장 · 고르면 바로 올라가요."
              >
                <div
                  id="popup-image"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={onDrop}
                  className={`flex items-center gap-4 rounded-lg border border-dashed px-4 py-3 ${
                    imageError || errorOf('image') ? 'border-warn' : 'border-admin-border'
                  }`}
                >
                  <div className="h-[100px] w-20 shrink-0 overflow-hidden rounded-md bg-admin-bg">
                    {draft.image ? (
                      <img
                        src={draft.image.url}
                        alt=""
                        className="h-full w-full object-cover"
                        onLoad={(e) =>
                          setImageSize({
                            width: e.currentTarget.naturalWidth,
                            height: e.currentTarget.naturalHeight,
                          })
                        }
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-[13px] text-admin-text">
                      {uploading
                        ? '올리는 중이에요…'
                        : draft.image
                          ? [
                              imageSize ? `${imageSize.width} × ${imageSize.height}` : null,
                              draft.image.bytes !== null
                                ? `${formatCount(Math.round(draft.image.bytes / 1024))}KB`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' · ') || '올린 이미지'
                          : '여기에 끌어다 놓거나 파일을 고르세요.'}
                    </p>
                    {offRatio ? (
                      <p className="text-xs text-admin-muted">
                        권장 비율(4:5)과 달라 앱에서 위아래나 양옆이 잘려요 · 오른쪽 미리보기가 실제로
                        잘리는 모양이에요.
                      </p>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => fileInput.current?.click()}
                      className="h-8 rounded-lg border border-admin-border bg-admin-surface px-3 text-[13px] text-admin-text hover:bg-admin-bg disabled:opacity-50"
                    >
                      {draft.image ? '바꾸기' : '파일 고르기'}
                    </button>
                    <input
                      ref={fileInput}
                      type="file"
                      accept={POPUP_IMAGE_TYPES.join(',')}
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        e.target.value = ''
                        if (file) void upload(file)
                      }}
                    />
                  </div>
                </div>
              </Field>
              <Field
                label="대체 문구"
                htmlFor="popup-alt"
                error={errorOf('imageAlt')}
                hint="화면 읽기 프로그램이 이미지 대신 읽어 줘요 · 이미지에 쓰인 글을 그대로 옮겨 주세요."
                count={{ value: draft.imageAlt.length, max: POPUP_LIMITS.imageAlt }}
              >
                <textarea
                  id="popup-alt"
                  rows={2}
                  value={draft.imageAlt}
                  onChange={(e) => set('imageAlt', e.target.value)}
                  onBlur={() => touch('imageAlt')}
                  placeholder="예) 치즈모아 사용 설문 · 참여하면 커피 기프티콘"
                  className={textareaClassName(Boolean(errorOf('imageAlt')))}
                />
              </Field>
            </FormSection>

            <FormSection title="버튼·링크" description="이미지와 버튼, 어느 쪽을 눌러도 같은 링크가 열려요.">
              <Field
                label="버튼 문구"
                htmlFor="popup-cta"
                optional
                error={errorOf('ctaLabel')}
                hint="비워 두면 버튼 없이 이미지만 떠요 · 길면 앱이 글자를 줄여 한 줄에 맞춰요."
                count={{ value: draft.ctaLabel.length, max: POPUP_LIMITS.ctaLabel }}
              >
                <input
                  id="popup-cta"
                  value={draft.ctaLabel}
                  onChange={(e) => set('ctaLabel', e.target.value)}
                  onBlur={() => touch('ctaLabel')}
                  placeholder="예) 설문 참여하기"
                  className={inputClassName(Boolean(errorOf('ctaLabel')))}
                />
              </Field>
              <Field
                label="링크"
                htmlFor="popup-link"
                error={errorOf('linkUrl')}
                hint={isPopupSurveyForm(draft.linkUrl.trim())
                  ? '이 설문은 앱에서 열면 모임 선택 후 본인 닉네임과 모임 이름이 자동 입력돼요. 관리자 미리보기에는 적용되지 않아요.'
                  : 'https 주소만 쓸 수 있어요(구글폼 등).'}
              >
                <input
                  id="popup-link"
                  type="url"
                  inputMode="url"
                  value={draft.linkUrl}
                  onChange={(e) => set('linkUrl', e.target.value)}
                  onBlur={() => touch('linkUrl')}
                  placeholder="https://forms.gle/…"
                  className={inputClassName(Boolean(errorOf('linkUrl')))}
                />
              </Field>
              <Field label="여는 방식" hint="앱 안 브라우저는 다 보고 닫으면 앱으로 돌아와요.">
                <ChoiceGroup
                  label="여는 방식"
                  value={draft.linkTarget}
                  choices={LINK_TARGET_CHOICES}
                  onChange={(value) => set('linkTarget', value)}
                />
              </Field>
            </FormSection>

            <FormSection title="누구에게 · 언제">
              <Field label="대상" hint="가입할 때 고른 계정 유형 기준이에요(모임에서의 역할과 무관).">
                <ChoiceGroup
                  label="대상"
                  value={draft.audience}
                  choices={AUDIENCE_CHOICES}
                  onChange={(value) => set('audience', value)}
                />
              </Field>
              <Field
                label="언어"
                hint="앱 표시 언어가 이 언어인 사람에게만 보여요 · 그 밖의 언어는 한국어 팝업을 봐요."
              >
                <ChoiceGroup
                  label="언어"
                  value={draft.locale}
                  choices={LOCALE_CHOICES}
                  onChange={(value) => set('locale', value)}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="시작 (한국 시간)" htmlFor="popup-starts" error={errorOf('startsLocal')}>
                  <input
                    id="popup-starts"
                    type="datetime-local"
                    value={draft.startsLocal}
                    onChange={(e) => set('startsLocal', e.target.value)}
                    onBlur={() => touch('startsLocal')}
                    className={inputClassName(Boolean(errorOf('startsLocal')))}
                  />
                </Field>
                <Field
                  label="끝 (한국 시간)"
                  htmlFor="popup-ends"
                  error={errorOf('endsLocal')}
                  hint={endedAlready ? '이미 지난 시각이에요 · 저장해도 앱에 보이지 않아요.' : undefined}
                >
                  <input
                    id="popup-ends"
                    type="datetime-local"
                    value={draft.endsLocal}
                    onChange={(e) => set('endsLocal', e.target.value)}
                    onBlur={() => touch('endsLocal')}
                    className={inputClassName(Boolean(errorOf('endsLocal')))}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="우선순위"
                  htmlFor="popup-priority"
                  error={errorOf('priority')}
                  hint="클수록 먼저 · 같은 때 여럿이면 하나만 떠요."
                >
                  <input
                    id="popup-priority"
                    type="number"
                    step={1}
                    value={draft.priority}
                    onChange={(e) => set('priority', e.target.value)}
                    onBlur={() => touch('priority')}
                    className={inputClassName(Boolean(errorOf('priority')))}
                  />
                </Field>
                <Field
                  label="최소 앱 버전"
                  htmlFor="popup-version"
                  optional
                  error={errorOf('minAppVersion')}
                  hint="이 버전보다 낮은 앱에는 안 보여요."
                >
                  <input
                    id="popup-version"
                    value={draft.minAppVersion}
                    onChange={(e) => set('minAppVersion', e.target.value)}
                    onBlur={() => touch('minAppVersion')}
                    placeholder="예) 2.7.0"
                    className={inputClassName(Boolean(errorOf('minAppVersion')))}
                  />
                </Field>
              </div>
              <ToggleRow
                label="[오늘 하루 보지 않기] 버튼 보이기"
                hint="끄면 [닫기]만 있어요 · 닫은 사람에게는 다음에 앱을 열 때 다시 떠요."
                checked={draft.hideToday}
                onChange={(next) => set('hideToday', next)}
              />
              <ToggleRow
                label="켜 두기"
                hint="꺼 두면 기간이 와도 앱에 안 보여요 · 목록에서 언제든 켤 수 있어요."
                checked={draft.active}
                onChange={(next) => set('active', next)}
              />
            </FormSection>

            {formError ? (
              <p className="rounded-lg bg-warn/10 px-4 py-3 text-[13px] text-warn" role="alert">
                {formError}
              </p>
            ) : null}

            <div className="flex items-center justify-end gap-2 pb-8">
              <Link
                to="/admin/popups"
                className="inline-flex h-10 items-center rounded-lg border border-admin-border bg-admin-surface px-4 text-[13px] text-admin-text hover:bg-admin-bg"
              >
                취소
              </Link>
              <button
                type="submit"
                disabled={busy}
                className="h-10 rounded-lg border border-primary bg-primary px-5 text-[13px] font-semibold text-admin-text hover:brightness-95 disabled:opacity-50"
              >
                {saving ? '저장 중…' : editing ? '저장' : '만들기'}
              </button>
            </div>
          </form>

          <aside className="w-[316px] shrink-0 space-y-3 xl:sticky xl:top-0">
            <p className="text-xs font-medium text-admin-muted">앱에서 이렇게 보여요</p>
            <PopupPhonePreview
              imageUrl={draft.image?.url ?? null}
              imageAlt={draft.imageAlt}
              ctaLabel={draft.ctaLabel}
              hideOption={draft.hideToday ? 'TODAY' : 'NONE'}
              locale={draft.locale}
            />
            <p className="text-xs leading-relaxed text-admin-muted">
              {draft.linkUrl.trim() && isHttpsLink(draft.linkUrl.trim())
                ? `누르면 ${popupLinkTargetLabel(draft.linkTarget)}로 ${linkHost(draft.linkUrl.trim())} 이(가) 열려요.`
                : '링크를 적으면 무엇이 열리는지 여기에 보여요.'}
              {' '}아래 줄 문구는 앱이 언어에 맞춰 넣어요.
            </p>
          </aside>
        </div>
      </div>
    </>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-[13px] font-semibold">{label}</p>
        <p className="mt-0.5 text-xs text-admin-muted">{hint}</p>
      </div>
      <AdminSwitch checked={checked} label={label} onChange={onChange} />
    </div>
  )
}
