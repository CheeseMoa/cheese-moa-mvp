/**
 * 서비스 일시 중단(읽기 전용) 운영 (CHMO-994 · BE CHMO-993 · APP CHMO-995).
 *
 * 저장·이력·복원은 운영 설정(CHMO-958)을 그대로 쓰고, 여기에는 화면이 쓰는 문구와 판정만 둔다.
 * 앱 기본 문구·안내 화면 문구는 APP CHMO-995 ARB(`servicePaused*`, 2026-11-17 착수분)를 옮겨 왔다.
 * 앱 문구가 바뀌면 같이 고친다.
 */
import type { Locale, ServiceSettings, SettingsHistory } from '../api/operationSettings'

/** 읽기 전용 전환 확인창에서 운영자가 직접 입력해야 하는 문구 */
export const READ_ONLY_CONFIRM_PHRASE = '읽기 전용'
/**
 * BE `ServiceSettings.Notice` 검증과 같은 상한 — 앞뒤 공백을 걷어낸 뒤 **코드 포인트**로 센다.
 * 공백만 있는 값은 거절, 비우면 null(앱 기본 문구).
 */
export const NOTICE_TITLE_MAX = 40
export const NOTICE_BODY_MAX = 300

/** 서버가 저장하는 모양(앞뒤 공백 제거)과 그 길이(코드 포인트 — 이모지 1자) */
export function noticeText(value: string): string {
  return value.trim()
}
export function noticeLength(value: string): number {
  return [...noticeText(value)].length
}

export const LOCALE_LABEL: Record<Locale, string> = { ko: '한국어', en: 'English', ja: '日本語' }

/** 앱 안내 화면 문구. title·body는 어드민 문구가 비었을 때 앱이 쓰는 기본값이기도 하다. */
export const SERVICE_PAUSE_COPY: Record<
  Locale,
  {
    title: string
    body: string
    availableLabel: string
    available: string[]
    stoppedLabel: string
    stopped: string[]
    signedIn: string
    signedOut: string
  }
> = {
  ko: {
    title: '더 좋은 치즈모아로 돌아올게요',
    body: '서비스를 새로 다듬는 동안 사진 올리기와 모임 만들기를 잠시 멈춰요.\n그동안 올린 사진은 지금처럼 보고 저장할 수 있어요.',
    availableLabel: '지금 할 수 있어요',
    available: ['올린 사진 보기', '갤러리에 저장·공유'],
    stoppedLabel: '잠시 멈춰요',
    stopped: ['사진 올리기', '모임 만들기·참여·초대', '사진 정리·공개·댓글'],
    signedIn: '사진 보러 가기',
    signedOut: '확인',
  },
  en: {
    title: "We'll be back with a better CheeseMoa",
    body: "While we improve the service, uploading photos and creating groups are paused.\nYou can still view and save the photos you've uploaded.",
    availableLabel: 'Available now',
    available: ['View your photos', 'Save to gallery and share'],
    stoppedLabel: 'Paused for now',
    stopped: [
      'Uploading photos',
      'Creating, joining, and inviting to groups',
      'Organizing, publishing, and commenting',
    ],
    signedIn: 'View my photos',
    signedOut: 'OK',
  },
  ja: {
    title: 'より良いチーズモアになって戻ってきます',
    body: 'サービスを改善している間、写真のアップロードとグループの作成を一時停止します。\nこれまでの写真は今まで通り閲覧・保存できます。',
    availableLabel: '今できること',
    available: ['写真の閲覧', 'ギャラリーへの保存・共有'],
    stoppedLabel: '一時停止中',
    stopped: ['写真のアップロード', 'グループの作成・参加・招待', '写真の整理・公開・コメント'],
    signedIn: '写真を見る',
    signedOut: 'OK',
  },
}

/** 전환 확인창의 영향 요약(BE CHMO-993 스펙 §2 정책 결정·§3.3 허용 목록 대조) */
export const READ_ONLY_KEEPS = [
  '사진 보기·저장·공유',
  '기존 회원 로그인',
  '신고·문의',
  '알림·혜택 수신 설정',
  '계정 삭제',
  '유료 구독 해지',
  '이미 스토어에서 결제된 거래의 지급·환불 반영',
]
export const READ_ONLY_STOPS = [
  '사진 올리기',
  '모임 만들기·참여·초대',
  '공개·사진 정리·얼굴 가리기',
  '댓글·좋아요',
  '모든 새 결제(패스·구독)·출석',
  '새 가입',
  '리마인드·출석·혜택 알림 발송',
  '이벤트 팝업',
]

/**
 * NORMAL이 아니면 전부 멈춘 것으로 본다. 앱(CHMO-995)이 모르는 모드를 읽기 전용으로 해석하므로
 * 어드민도 같은 기준으로 띠를 건다. 키가 없거나 조회 전이면 평소 운영이다.
 */
export function isPausedMode(mode: string | null | undefined): boolean {
  return typeof mode === 'string' && mode !== '' && mode !== 'NORMAL'
}

export function serviceModeLabel(mode: string): string {
  if (mode === 'NORMAL') return '평소 운영'
  if (mode === 'READ_ONLY') return '읽기 전용'
  return `알 수 없는 상태(${mode})`
}

/** 비운 칸은 앱 기본 문구로 채운다. 서버가 저장할 모양(앞뒤 공백 제거)으로 보여 준다. */
export function noticeDisplay(locale: Locale, title: string, body: string) {
  const fallback = SERVICE_PAUSE_COPY[locale]
  return {
    title: noticeText(title) || fallback.title,
    body: noticeText(body) || fallback.body,
  }
}

/** 언어별로 앱에 무엇이 나가는지 한 낱말로 — 확인창·언어 선택에 쓴다 */
export function noticeSource(title: string, body: string): string {
  const custom = [title.trim(), body.trim()].filter(Boolean).length
  return custom === 2 ? '직접 입력' : custom === 0 ? '기본 문구' : '일부 직접 입력'
}

export function noticeOf(service: ServiceSettings | null | undefined, locale: Locale) {
  const copy = service?.notice?.[locale]
  return { title: copy?.title ?? '', body: copy?.body ?? '' }
}

/**
 * 가장 최근의 모드 전환 이력(목록은 최신순). 이력 전후 모두에 모드가 있어야 전환으로 본다.
 * 서버 반영 전 이력(service 없음)과 섞인 첫 변경을 전환으로 오인하지 않기 위해서다.
 */
export function latestModeChange(items: SettingsHistory[]): SettingsHistory | null {
  return (
    items.find((item) => {
      const before = item.before?.service?.mode
      const after = item.after?.service?.mode
      return typeof before === 'string' && typeof after === 'string' && before !== after
    }) ?? null
  )
}
