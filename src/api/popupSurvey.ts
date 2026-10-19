import { apiFetch } from './client'
import { isPopupSurveyForm } from '../lib/popupSurvey'

export interface PopupSurveyContext {
  nickname: string
  groups: { groupId: number; name: string }[]
}

function options(token: string, signal?: AbortSignal) {
  return {
    auth: 'none' as const,
    headers: { 'X-Survey-Token': token },
    credentials: 'omit' as const,
    cache: 'no-store' as const,
    referrerPolicy: 'no-referrer' as const,
    signal,
  }
}

export async function getPopupSurveyContext(
  token: string,
  signal?: AbortSignal,
): Promise<PopupSurveyContext> {
  const raw = await apiFetch<PopupSurveyContext>('/popup-surveys/context', options(token, signal))
  if (
    !raw ||
    typeof raw.nickname !== 'string' ||
    !Array.isArray(raw.groups) ||
    !raw.groups.every(
      (group) =>
        Number.isSafeInteger(group.groupId) && group.groupId > 0 && typeof group.name === 'string',
    )
  ) {
    throw new Error('Invalid survey context')
  }
  return raw
}

export async function getPopupSurveyLink(
  token: string,
  groupId: number,
  signal?: AbortSignal,
): Promise<string> {
  const raw = await apiFetch<{ url: string }>('/popup-surveys/link', {
    ...options(token, signal),
    method: 'POST',
    body: { groupId },
  })
  if (!raw || typeof raw.url !== 'string' || !isPopupSurveyForm(raw.url)) {
    throw new Error('Invalid survey destination')
  }
  return raw.url
}
