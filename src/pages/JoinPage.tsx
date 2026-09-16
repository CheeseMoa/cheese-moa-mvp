import { useSearchParams } from 'react-router-dom'
import { AppOpenGuide } from '../components/AppOpenGuide'
import { parseJoinLinkInfo } from '../lib/joinLink'

/**
 * 02-1. 초대 링크 착지 `/join/:joinKey` — **앱 유도 전용** (CHMO-820, 2026-09-16 "무조건 앱으로").
 *
 * 이 경로는 앱이 AASA·assetlinks.json으로 등록한 유니버설/앱 링크다(CHMO-538). 앱이 깔려 있으면
 * OS가 여기 오기 전에 앱을 열고, 웹이 그려진다는 건 앱이 없거나 링크가 발동하지 않는 자리(카톡
 * 인앱 브라우저·주소창 입력)라는 뜻이다 — 그래서 웹은 합류(로그인 → 02-1 모달·02-2 단일 화면)를
 * 더는 그리지 않고 앱 열기·스토어 안내만 한다(AppOpenGuide). 종전 웹 합류 흐름(로그인 returnTo·
 * 이미 멤버 사전 감지·ParentJoinPage)은 여기서 걷었다. 홈 [모임 참여하기](JoinGroupModal)의
 * viewer 코드 인계도 이 경로로 오므로 같은 안내에 착지한다 — 학부모 합류는 앱에서만.
 *
 * 링크 마커(lib/joinLink)는 모임명만 읽는다 — 안내 문구용. joinKey는 URL에 그대로 남아 앱이
 * 열릴 때 스킴/intent에 실려 간다.
 */
export function JoinPage() {
  const [searchParams] = useSearchParams()
  const { groupName } = parseJoinLinkInfo(searchParams)
  return <AppOpenGuide groupName={groupName} />
}
