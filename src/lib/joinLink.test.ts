import { describe, expect, it } from 'vitest'
import { buildJoinPath, buildJoinUrl, parseJoinLinkInfo } from './joinLink'

/**
 * 초대 링크 FE 계약(CHMO-607) — 생성과 해석이 한 모듈이라, 여기서 왕복을 고정하면
 * GroupInviteLinks(생성)와 JoinPage(해석)가 어긋날 수 없다.
 */
describe('joinLink — 초대 링크 마커 계약', () => {
  it('일반 모임 링크 — 유형·모임명·카운트 왕복', () => {
    const path = buildJoinPath('Fh1TDIk81EPP', {
      groupType: 'general',
      groupName: '제주 가족여행',
      memberCount: 6,
      eventCount: 3,
    })
    expect(path.startsWith('/join/Fh1TDIk81EPP?')).toBe(true)
    const info = parseJoinLinkInfo(new URLSearchParams(path.split('?')[1]))
    expect(info).toEqual({
      groupType: 'general',
      role: undefined,
      groupName: '제주 가족여행',
      memberCount: 6,
      eventCount: 3,
    })
  })

  it('비즈니스 viewer 키 링크 — role 마커가 실리고, editor 키는 role을 싣지 않는다', () => {
    const viewerPath = buildJoinPath('K', { groupType: 'business', role: 'viewer', groupName: '햇살반' })
    expect(viewerPath).toContain('role=viewer')
    expect(parseJoinLinkInfo(new URLSearchParams(viewerPath.split('?')[1])).role).toBe('viewer')

    const editorPath = buildJoinPath('K', { groupType: 'business', role: 'editor', groupName: '햇살반' })
    expect(editorPath).not.toContain('role=')
  })

  it('구 마커 role=parent를 viewer로 흡수하고, 유형 마커가 없으면 business로 좁힌다 (CHMO-445 링크)', () => {
    const info = parseJoinLinkInfo(new URLSearchParams('role=parent'))
    expect(info.role).toBe('viewer')
    // viewer 키는 비즈니스 모임에만 있다(GENERAL 학부모 키는 SPACE404 — BE CHMO-599 AC-6)
    expect(info.groupType).toBe('business')
  })

  it('이상값은 없는 것으로 — 링크는 외부 입력이다', () => {
    const info = parseJoinLinkInfo(
      new URLSearchParams('type=weird&role=admin&members=abc&events=-1&name=%20'),
    )
    expect(info).toEqual({
      groupType: undefined,
      role: undefined,
      groupName: undefined,
      memberCount: undefined,
      eventCount: undefined,
    })
  })

  it('마커 없는 링크(정보 미상)와 절대 URL 파생', () => {
    expect(buildJoinPath('AbC012')).toBe('/join/AbC012')
    expect(buildJoinUrl('https://app.cheese-moa.com', 'AbC012', { groupType: 'general' })).toBe(
      'https://app.cheese-moa.com/join/AbC012?type=general',
    )
  })
})
