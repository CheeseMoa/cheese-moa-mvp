import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ApiRequestError } from '../api/client'
import {
  getPopupSurveyContext,
  getPopupSurveyLink,
  type PopupSurveyContext,
} from '../api/popupSurvey'
import { PhoneShell } from '../components/PhoneShell'
import { Button, Cheddar } from '../components/ui'
import { LanguagePicker } from '../i18n/LanguagePicker'
import { PublicMetadata } from '../i18n/PublicMetadata'
import { usePublicLocale } from '../i18n/usePublicLocale'
import { readPopupSurveyToken } from '../lib/popupSurvey'

type SurveyError =
  'surveyExpired' | 'surveyUnavailable' | 'surveyFailed' | 'surveyMembershipChanged'

function errorKey(error: unknown): SurveyError {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return 'surveyExpired'
    if (error.status === 404) return 'surveyUnavailable'
    if (error.status === 403) return 'surveyMembershipChanged'
  }
  return 'surveyFailed'
}

export function PopupSurveyPage() {
  const { t } = usePublicLocale()
  const { hash } = useLocation()
  const token = useMemo(() => readPopupSurveyToken(hash), [hash])
  const [context, setContext] = useState<PopupSurveyContext | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<SurveyError | null>(null)
  const [attempt, setAttempt] = useState(0)
  const request = useRef<AbortController | null>(null)
  const openingRef = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    request.current = controller
    openingRef.current = false
    setOpening(false)
    setLoading(true)
    setContext(null)
    setSelected(null)
    setError(null)
    if (!token) {
      setError('surveyExpired')
      setLoading(false)
      return () => controller.abort()
    }
    void getPopupSurveyContext(token, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setContext(result)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(errorKey(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [token, attempt])

  async function openForm() {
    if (!token || selected === null || openingRef.current || request.current?.signal.aborted) return
    openingRef.current = true
    setOpening(true)
    setError(null)
    const controller = request.current!
    try {
      const url = await getPopupSurveyLink(token, selected, controller.signal)
      if (!controller.signal.aborted) window.location.assign(url)
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorKey(cause))
    } finally {
      if (!controller.signal.aborted) {
        openingRef.current = false
        setOpening(false)
      }
    }
  }

  const fatal = error === 'surveyExpired' || error === 'surveyUnavailable'
  const hasGroups = context !== null && context.groups.length > 0
  return (
    <PhoneShell>
      <PublicMetadata title={t('surveyTitle')} description={t('surveyIntro')} alternates={false} />
      <div className="flex h-full flex-col bg-white text-app-ink">
        <header className="flex items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Cheddar size={32} />
            {t('brand')}
          </div>
          <LanguagePicker compact />
        </header>
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6 pt-5">
          <p className="mb-3 text-xs font-bold tracking-wide text-app-inkSub">{t('surveyTitle')}</p>
          <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.6px]">
            {t('surveyChooseGroup')}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-app-inkSub">{t('surveyIntro')}</p>
          {loading && (
            <p role="status" className="mt-10 text-sm text-app-inkSub">
              {t('surveyLoading')}
            </p>
          )}
          {error && (
            <div
              role="alert"
              className="mt-6 rounded-2xl border border-app-border p-4 text-sm leading-relaxed"
            >
              <p>{t(error)}</p>
              {!fatal && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  disabled={opening}
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  {t('surveyRetry')}
                </Button>
              )}
            </div>
          )}
          {context && !fatal && (
            <>
              <div className="my-7 rounded-2xl bg-app-chip px-4 py-3">
                <p className="text-xs text-app-inkSub">{t('surveyNickname')}</p>
                <p className="mt-1 break-words text-base font-bold">{context.nickname}</p>
              </div>
              {hasGroups ? (
                <form
                  id="survey-group-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void openForm()
                  }}
                >
                  <fieldset disabled={opening}>
                    <legend className="sr-only">{t('surveyChooseGroup')}</legend>
                    <div className="space-y-3">
                      {context.groups.map((group) => (
                        <label
                          key={group.groupId}
                          className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-app-ink ${selected === group.groupId ? 'border-app-ink bg-[#FFF9E8]' : 'border-app-border bg-white'} ${opening ? 'cursor-wait opacity-60' : ''}`}
                        >
                          <input
                            type="radio"
                            name="survey-group"
                            value={group.groupId}
                            checked={selected === group.groupId}
                            onChange={() => setSelected(group.groupId)}
                            className="h-5 w-5 shrink-0 accent-app-ink"
                          />
                          <span className="break-words text-base font-semibold">{group.name}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </form>
              ) : (
                <p role="status" className="text-sm leading-relaxed text-app-inkSub">
                  {t('surveyNoGroups')}
                </p>
              )}
            </>
          )}
        </main>
        {hasGroups && !fatal && (
          <footer className="border-t border-app-border px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-5">
            <Button
              type="submit"
              form="survey-group-form"
              fullWidth
              disabled={selected === null || opening}
            >
              {t(opening ? 'surveyOpening' : 'surveyContinue')}
            </Button>
            <p className="mt-3 text-center text-xs leading-relaxed text-app-inkSub">
              {t('surveyGoogleHint')}
            </p>
          </footer>
        )}
      </div>
    </PhoneShell>
  )
}
