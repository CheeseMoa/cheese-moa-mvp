import { describe, expect, it, vi } from 'vitest'
import { getPopupSurveyContext, getPopupSurveyLink } from './popupSurvey'
import { ApiRequestError } from './client'
import { getAccessToken, setAuthTokens } from '../lib/auth'
import { isPopupSurveyForm, isPopupSurveyPage, readPopupSurveyToken } from '../lib/popupSurvey'

const token = 'a'.repeat(70)
const form =
  'https://docs.google.com/forms/d/e/1FAIpQLSfTcstZ7TZ61U0gg6CejR5am1LYRX39Kp7bAe1i6cDJvMUFUQ/viewform'
function ok(result: unknown) {
  return new Response(JSON.stringify({ isSuccess: true, code: 'COMMON200', result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('설문 임시 권한과 이동 주소', () => {
  it('로그인 세션이 있어도 설문 권한만 헤더에 보내며 URL·쿠키·저장소에 복제하지 않는다', async () => {
    setAuthTokens({ accessToken: 'account-token', refreshToken: 'refresh-token' })
    const fetch = vi
      .fn()
      .mockResolvedValue(ok({ nickname: '정 선생 & +', groups: [{ groupId: 8, name: '햇살반' }] }))
    vi.stubGlobal('fetch', fetch)
    const result = await getPopupSurveyContext(token)
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/popup-surveys/context')
    expect(new Headers(init.headers).get('X-Survey-Token')).toBe(token)
    expect(new Headers(init.headers).has('Authorization')).toBe(false)
    expect(init).toMatchObject({
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    })
    expect(result.nickname).toBe('정 선생 & +')
    const savedValues = Array.from({ length: localStorage.length }, (_, i) =>
      localStorage.getItem(localStorage.key(i)!),
    )
    expect(savedValues.join()).not.toContain(token)
  })

  it('모임 ID만 보내고 자동 입력된 원문 주소를 받는다', async () => {
    const target = `${form}?usp=pp_url&entry.185546664=%EC%A0%95&entry.512208512=A%26B`
    const fetch = vi.fn().mockResolvedValue(ok({ url: target }))
    vi.stubGlobal('fetch', fetch)
    expect(await getPopupSurveyLink(token, 8)).toBe(target)
    const [, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ groupId: 8 })
  })

  it.each([
    'https://evil.example',
    form.replace('https:', 'http:'),
    form.replace('docs.google.com', 'docs.google.com.evil.example'),
    form.replace('docs.google.com', 'user@docs.google.com'),
    `${form}/other`,
  ])('외부 이동 대상으로 %s를 거부한다', async (url) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok({ url })))
    await expect(getPopupSurveyLink(token, 8)).rejects.toThrow('Invalid survey destination')
  })

  it('만료된 설문 권한은 로그인 토큰 재발급·삭제를 유발하지 않는다', async () => {
    setAuthTokens({ accessToken: 'account-token', refreshToken: 'refresh-token' })
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ isSuccess: false, code: 'SURVEY401', message: 'expired' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetch)
    await expect(getPopupSurveyContext(token)).rejects.toBeInstanceOf(ApiRequestError)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(getAccessToken()).toBe('account-token')
  })

  it.each([
    { nickname: '선생', groups: [{ groupId: -1, name: 'A' }] },
    { nickname: '선생', groups: null },
    { groups: [] },
  ])('잘못된 응답을 화면 데이터로 쓰지 않는다: %j', async (raw) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(raw)))
    await expect(getPopupSurveyContext(token)).rejects.toThrow()
  })

  it('취소 신호를 서버 요청에 전달한다', async () => {
    const fetch = vi.fn().mockResolvedValue(ok({ nickname: '선생', groups: [] }))
    vi.stubGlobal('fetch', fetch)
    const controller = new AbortController()
    await getPopupSurveyContext(token, controller.signal)
    expect((fetch.mock.calls[0][1] as RequestInit).signal).toBe(controller.signal)
  })

  it('단일 fragment 토큰만 읽고 로그인 JWT·중복·잘못된 길이는 거부한다', () => {
    expect(readPopupSurveyToken(`#token=${token}`)).toBe(token)
    expect(readPopupSurveyToken(`#token=${token}&token=${token}`)).toBeNull()
    expect(readPopupSurveyToken('#token=access.jwt.token')).toBeNull()
    expect(readPopupSurveyToken('#token=short')).toBeNull()
    expect(readPopupSurveyToken('')).toBeNull()
  })

  it('관리자 원본·미리 채운 링크를 모두 인식하며 설문 페이지를 추적 대상에서 구분한다', () => {
    expect(isPopupSurveyForm(form)).toBe(true)
    expect(isPopupSurveyForm(`${form}?usp=pp_url&entry.185546664=테스트`)).toBe(true)
    expect(isPopupSurveyForm('https://forms.gle/example')).toBe(false)
    expect(isPopupSurveyPage('/survey')).toBe(true)
    expect(isPopupSurveyPage('/survey/')).toBe(true)
    expect(isPopupSurveyPage('/admin/popups')).toBe(false)
  })
})
