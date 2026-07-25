/**
 * '분류가 어려워요'(uncertain) 사진의 분류 사유 문구 단일 원천 (CHMO-412).
 *
 * 코드는 AI팀 고정 계약(low_resolution·small_faces·single_appearance — BE는 pass-through),
 * 문구·톤은 FE가 소유한다. AI가 코드를 추가해도 화면이 깨지지 않도록 미지 코드는 무시하고,
 * 보여줄 문구가 하나도 없으면(빈 배열·전부 미지) 범용 문구 하나로 수렴한다.
 */

const CAUSE_MESSAGES: Record<string, string> = {
  low_resolution: '사진 화질이 낮아 얼굴을 알아보기 어려웠어요 — 원본 화질로 다시 올리면 나아져요',
  small_faces: '얼굴이 작게 찍혀 알아보기 어려웠어요',
  single_appearance: '이 얼굴이 나온 사진이 한 장뿐이라 앨범을 만들지 못했어요',
}

/** causes가 비었거나 전부 미지 코드일 때의 범용 문구 — uncertain 앨범인 것 자체가 맥락이다 */
export const GENERIC_UNCERTAIN_MESSAGE = '누구인지 확실하지 않아 분류하지 못했어요'

/**
 * causes 코드 배열 → 표시 문구 목록.
 * low_resolution은 계약상 항상 small_faces와 동반한다 — 둘 다 보여주면 같은 얘기가
 * 중복되므로 원인 쪽(low_resolution, 재업로드 안내 포함)만 남긴다.
 */
export function uncertainCauseMessages(causes: string[] | undefined): string[] {
  const known = (causes ?? []).filter((code) => code in CAUSE_MESSAGES)
  const deduped = known.includes('low_resolution')
    ? known.filter((code) => code !== 'small_faces')
    : known
  const messages = [...new Set(deduped.map((code) => CAUSE_MESSAGES[code]))]
  return messages.length > 0 ? messages : [GENERIC_UNCERTAIN_MESSAGE]
}
