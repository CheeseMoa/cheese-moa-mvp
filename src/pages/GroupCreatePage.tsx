import { ScreenStub, StubLink } from '../components/ScreenStub'

/** 03. 모임 만들기 · node 211:1411 · POST /groups */
export function GroupCreatePage() {
  return (
    <ScreenStub code="03" title="모임 만들기" node="211:1411" subtitle="이름 · 참여 비밀번호 (구현 예정)">
      <StubLink to="/groups/grp_1">생성 후 모임 상세로 (05)</StubLink>
      <StubLink to="/home">← 홈 / 내 모임 (02)</StubLink>
    </ScreenStub>
  )
}
