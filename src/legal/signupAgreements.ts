import { termsOfService } from './terms'
import { privacyPolicy } from './privacy'
import { biometricNotice } from './biometric'
import type { LegalDoc } from './types'
import type { AgreementType } from '../types/api'

/**
 * 가입 동의 화면(01-A)의 항목·문구 (CHMO-479). 정본: docs/legal/app-copy.md §1~§4 — 함께 수정할 것.
 *
 * 마케팅(선택)은 넣지 않는다(2026-08-03 결정 — 정본 §1.1): MVP에 발송 채널이 없어 전문을
 * 사실대로 쓸 수 없다. BE 카탈로그의 MARKETING은 그리지도 제출하지도 않는다(선택 항목이라
 * 게이트 판정과 무관). 채널이 생기면 전문·required 구분과 함께 추가한다.
 *
 * 제출 버전의 원천은 여기(=FE 문구)다(CHMO-517) — 전문이 있는 항목은 그 문서의 version을
 * 그대로 쓰고, 전문 없는 항목(만 14세)은 체크박스 문구와 버전을 이 파일이 함께 소유한다
 * (문구를 고치면 같은 자리에서 버전을 올린다 — BE AgreementType 버전과 반드시 함께).
 */
export interface SignupAgreementItem {
  type: AgreementType
  /** 체크박스 라벨 — "(필수)" 접두는 화면이 그린다 */
  label: string
  /** 제출(POST /agreements)에 실리는 버전 — 화면에 실제로 보여준 문구의 버전 */
  version: string
  /** [전문 보기] 시트가 그릴 문서 — 없으면 링크를 그리지 않는다(만 14세) */
  fullText?: LegalDoc
  /** 라벨 아래 부가 설명(정본 §4 — 전문 대신 자리에서 읽는 짧은 안내) */
  caption?: string
}

/**
 * 개인정보 수집·이용 동의 전문 (정본 §2) — 처리방침의 요약이 아니라 동의 시점 고지
 * (법 제15조② — 항목·목적·기간·거부권). 항목·기간의 원천이 처리방침(§2·§5)이라
 * 버전도 처리방침을 따라간다: 두 문서가 다른 항목을 말하면 그 자체가 결함이다.
 */
const privacyCollectionConsent: LegalDoc = {
  title: '개인정보 수집·이용 동의',
  version: privacyPolicy.version,
  status: '2026. 8. 3. 게시',
  intro: '치즈모아는 아래와 같이 개인정보를 수집·이용합니다.',
  sections: [
    {
      heading: '수집 항목',
      body: [
        [
          '회원 정보: 소셜 로그인 계정 식별자, 이름(표시명), 이메일',
          '모임 정보: 모임 이름, 참여 역할(선생님 또는 학부모), 합류 신청 내용',
          '학부모 회원: 자녀 이름',
          '업로드 사진: 사진 파일, 사진에 포함된 메타데이터(촬영 일시 등)',
          // 얼굴 특징정보는 여기 넣지 않는다 — 별도 동의(faceDataConsent)가 담당(법 제23조)
          '사진 속 인물 정보: 인물 표시 이름, 얼굴 썸네일, 분류·품질 판정 결과',
          '서비스 이용 기록: 접속 일시, 이용 내역, 기기·브라우저 정보, 오류 기록',
        ],
      ],
    },
    {
      heading: '수집·이용 목적',
      body: [
        [
          '회원 가입 및 본인 확인, 서비스 제공',
          '모임 참여 관리, 선생님·학부모 권한 구분',
          '사진 업로드·보관·공유 및 인물별 앨범 제공',
          '학부모와 자녀 인물 연결',
          '문의 응대 및 서비스 개선',
        ],
      ],
    },
    {
      heading: '보유·이용 기간',
      body: [
        [
          '회원 정보는 회원 탈퇴 시 지체 없이 파기합니다.',
          // 탈퇴 잔존 정책(CHMO-583) — 처리방침 §5와 같은 문장 축. 접속 로그 "1년"은 BE CHMO-584 후
          '사진과 인물 정보는 사진을 삭제하거나 모임이 삭제되면 파기합니다. 모임에 공유한 사진은 업로드한 회원이 모임에서 나가거나 탈퇴해도 모임 운영을 위해 모임에 남으며, 원하지 않으면 탈퇴 전에 직접 삭제할 수 있습니다.',
          '서비스 이용 기록은 관계 법령이 정한 기간 동안 보관합니다.',
          '그 밖에 관계 법령에 따라 보존할 의무가 있는 정보는 그 기간 동안 보관합니다.',
        ],
      ],
    },
    {
      heading: '동의를 거부할 권리',
      body: [
        '개인정보 수집·이용에 동의하지 않을 수 있습니다. 다만 동의하지 않으면 회원 가입 및 서비스 이용이 불가능합니다.',
      ],
    },
  ],
}

/**
 * 얼굴 특징정보 처리 동의 전문 (정본 §3) — 가입 동의 화면용 요약. 상세판은
 * 「얼굴 특징정보 처리 안내」(biometricNotice)가 원천이라 버전도 그것을 따른다.
 * 암호화 문구는 넣지 않는다(요건 충족 확인 전 — 정본 §3 적용 주의, 사실과 다른 고지 금지).
 */
const faceDataConsent: LegalDoc = {
  title: '얼굴 특징정보 처리 동의',
  version: biometricNotice.version,
  status: '2026. 8. 3. 게시',
  intro:
    '치즈모아는 업로드된 사진에서 얼굴을 찾아, 얼굴의 생김새를 여러 개의 숫자로 바꾼 값(얼굴 특징정보)을 만듭니다. 이 값이 서로 비슷한 얼굴끼리 묶어 인물별 앨범을 자동으로 만들어 드립니다.',
  sections: [
    {
      body: [
        '얼굴 특징정보는 「개인정보 보호법」상 민감정보(생체인식정보)에 해당하여, 다른 개인정보와 별도로 동의를 받습니다.',
      ],
    },
    {
      heading: '처리하는 정보',
      body: [['사진 속 얼굴 이미지(원본 사진 포함)', '얼굴 특징정보(숫자로 이루어진 수치 데이터)']],
    },
    {
      heading: '처리 목적',
      body: [['사진을 인물별 앨범으로 자동 분류', '같은 인물의 사진을 다시 찾아 연결']],
    },
    {
      heading: '보유·이용 기간',
      body: [
        [
          '사진을 공유한 모임이 삭제되면 지체 없이 파기합니다. 업로드한 회원이 모임에서 나가거나 탈퇴해도 사진과 얼굴 특징정보는 모임 운영을 위해 모임에 남습니다.',
          '사진을 삭제하면 그 사진에서 만든 얼굴 특징정보도 함께 파기합니다.',
        ],
      ],
    },
    {
      heading: '안전조치',
      body: ['접근 권한을 최소한으로 제한하고 접근 기록을 남깁니다.'],
    },
    {
      heading: '동의를 거부할 권리',
      body: [
        '얼굴 특징정보 처리에 동의하지 않을 수 있습니다. 다만 동의하지 않으면 인물별 자동 분류 기능을 이용할 수 없습니다.',
      ],
    },
  ],
}

/**
 * "전체 동의"가 켜고 끄는 일반 항목 — 얼굴 특징정보는 **넣지 않는다**(정본 §1.1 설계 제약 1:
 * 법 제23조가 민감정보를 다른 동의와 별도로 받도록 요구 — 전체 동의 한 번에 함께 체크되면
 * 별도 동의로 인정받지 못할 위험).
 */
export const SIGNUP_GENERAL_ITEMS: SignupAgreementItem[] = [
  {
    type: 'age_14_over',
    label: '만 14세 이상입니다',
    // 전문 문서가 없는 항목 — 문구(label·caption)를 고치면 이 버전도 여기서 올린다(CHMO-517)
    version: '1.0',
    caption:
      '치즈모아는 만 14세 이상만 가입할 수 있어요. 사진에 등장하는 아이들의 개인정보는 보호자(법정대리인)의 동의를 받아 처리해요.',
  },
  {
    type: 'terms_of_service',
    label: '이용약관 동의',
    version: termsOfService.version,
    fullText: termsOfService,
  },
  {
    type: 'privacy_policy',
    label: '개인정보 수집·이용 동의',
    version: privacyCollectionConsent.version,
    fullText: privacyCollectionConsent,
  },
]

/** 별도 영역(얼굴 인식 기능 동의) 항목 — 시각적으로 구분된 영역에서 개별 체크 */
export const SIGNUP_FACE_ITEM: SignupAgreementItem = {
  type: 'face_data',
  label: '얼굴 특징정보 처리 동의',
  version: faceDataConsent.version,
  fullText: faceDataConsent,
}

/** 게이트 판정·제출이 도는 전 항목(전부 필수) — 화면 표시 순서 그대로 */
export const SIGNUP_AGREEMENT_ITEMS: SignupAgreementItem[] = [
  ...SIGNUP_GENERAL_ITEMS,
  SIGNUP_FACE_ITEM,
]

/** 별도 영역 구획 라벨 (정본 §1.1) */
export const FACE_SECTION_LABEL = '얼굴 인식 기능 동의 (별도)'

/**
 * 하단 안내 (정본 §1.2) — "선택 항목은 동의하지 않아도 이용 가능" 줄은 마케팅 제외 결정으로
 * 선택 항목이 없어져 함께 보류(선택 항목이 돌아올 때 제22조⑤ 안내와 같이 되살린다).
 */
export const SIGNUP_CONSENT_NOTICE = '필수 항목에 동의하지 않으면 서비스를 이용할 수 없습니다.'
