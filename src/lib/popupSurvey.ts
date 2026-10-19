const FORM_PATH = '/forms/d/e/1FAIpQLSfTcstZ7TZ61U0gg6CejR5am1LYRX39Kp7bAe1i6cDJvMUFUQ/viewform'

/** 이번 설문만 허용한다. 서버 응답도 임의 외부 이동 주소로 신뢰하지 않는다. */
export function isPopupSurveyForm(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.hostname === 'docs.google.com' &&
      url.port === '' &&
      url.username === '' &&
      url.password === '' &&
      url.pathname === FORM_PATH
    )
  } catch {
    return false
  }
}

/** fragment는 HTTP 요청·Referer로 전달되지 않는다. 일반 로그인 토큰은 받지 않는다. */
export function readPopupSurveyToken(hash: string): string | null {
  const values = new URLSearchParams(hash.replace(/^#/, '')).getAll('token')
  return values.length === 1 && /^[A-Za-z0-9_-]{70}$/.test(values[0]) ? values[0] : null
}

export function isPopupSurveyPage(pathname: string): boolean {
  return pathname === '/survey' || pathname === '/survey/'
}
