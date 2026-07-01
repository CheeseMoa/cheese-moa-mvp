import { ScreenStub, StubLink } from '../components/ScreenStub'

/** 404 */
export function NotFoundPage() {
  return (
    <ScreenStub code="404" title="페이지를 찾을 수 없어요" subtitle="주소를 다시 확인해 주세요">
      <StubLink to="/">로그인 진입 (01)</StubLink>
      <StubLink to="/home">홈 / 내 모임 (02)</StubLink>
    </ScreenStub>
  )
}
