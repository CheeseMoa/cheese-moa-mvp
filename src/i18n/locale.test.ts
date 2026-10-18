import { describe, expect, it } from 'vitest'
import { resolvePublicLocale, withLanguage } from './locale'
import { createPublicI18n, publicResources } from './instance'
import { deletionGuide } from '../legal/deletionGuides.localized'

describe('외부 페이지 언어 계약', () => {
  it.each([
    ['?lang=ja', ['en-US'], 'ja'],
    ['?lang=EN-us', ['ko-KR'], 'en'],
    ['', ['fr-FR', 'ja-JP', 'en'], 'ja'],
    ['?lang=xx', ['ko-KR'], 'ko'],
    ['', ['de-DE'], 'en'],
    ['', [], 'en'],
    ['?lang=ko', ['ja'], 'ko'],
  ])('%s / %j → %s', (search, languages, expected) => {
    expect(resolvePublicLocale(search, languages)).toBe(expected)
  })
  it('언어 전환이 초대 키·역할·이름·비밀번호·광고 파라미터·해시를 보존한다', () => {
    const source =
      '/join/AbCd12?role=viewer&name=A%26B&password=A%2Bb&lang=ko&utm_source=instagram#help'
    const result = new URL(withLanguage(source, 'ja'), 'https://app.cheese-moa.com')
    expect(result.pathname).toBe('/join/AbCd12')
    expect(Object.fromEntries(result.searchParams)).toEqual({
      role: 'viewer',
      name: 'A&B',
      password: 'A+b',
      lang: 'ja',
      utm_source: 'instagram',
    })
    expect(result.hash).toBe('#help')
  })
  it('각 언어가 모든 키와 동일한 보간 변수를 가진다', () => {
    const variables = (text: string) => [...text.matchAll(/{{(\w+)}}/g)].map((m) => m[1]).sort()
    for (const locale of ['en', 'ja'] as const) {
      expect(Object.keys(publicResources[locale]).sort()).toEqual(
        Object.keys(publicResources.ko).sort(),
      )
      for (const key of Object.keys(publicResources.ko) as (keyof typeof publicResources.ko)[]) {
        expect(variables(publicResources[locale][key]), `${locale}.${key}`).toEqual(
          variables(publicResources.ko[key]),
        )
      }
    }
  })
  it('인스턴스 간 언어가 섞이지 않고 모임 이름을 번역 키로 해석하지 않는다', () => {
    const en = createPublicI18n('en'),
      ja = createPublicI18n('ja')
    expect(en.t('openButton')).toBe('Open in app')
    expect(ja.t('openButton')).toBe('アプリで開く')
    expect(en.t('groupInvite', { group: '<b>{{home}}</b>' })).toBe(
      'Invitation to “<b>{{home}}</b>”',
    )
  })
  it('삭제 안내 번역은 원문 버전과 절·목록 구조를 유지한다', () => {
    for (const kind of ['account', 'data'] as const) {
      const original = deletionGuide(kind, 'ko')
      for (const locale of ['en', 'ja'] as const) {
        const doc = deletionGuide(kind, locale)
        expect(doc.version).toBe(original.version)
        expect(
          doc.sections.map((section) =>
            section.body.map((block) => (Array.isArray(block) ? block.length : 'paragraph')),
          ),
        ).toEqual(
          original.sections.map((section) =>
            section.body.map((block) => (Array.isArray(block) ? block.length : 'paragraph')),
          ),
        )
      }
    }
  })
})
