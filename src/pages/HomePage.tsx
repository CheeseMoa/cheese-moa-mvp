import { ScreenStub, StubLink } from '../components/ScreenStub'

/** 02. 홈 / 내 모임 · node 211:1357 · GET /groups */
export function HomePage() {
  return (
    <ScreenStub code="02" title="내 모임" node="211:1357" subtitle="참여 중인 모임을 확인하세요">
      <StubLink to="/groups/grp_1">모임 상세 예시 (05)</StubLink>
      <StubLink to="/groups/new">＋ 모임 만들기 (03)</StubLink>
      <StubLink to="/join/HAETSAL">모임 참여하기 (02-1)</StubLink>
      <StubLink to="/settings">설정 / 프로필 편집</StubLink>
    </ScreenStub>
  )
}
