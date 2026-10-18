import type { LegalDoc } from './types'
import { accountDeletionGuide, dataDeletionGuide } from './deletionGuides'
import type { PublicLocale } from '../i18n/locale'

/** CHMO-888: 기존 삭제 안내의 번역. 보유기간·삭제 범위·버전은 한국어 원문과 동일하다. */
const account: Record<'en' | 'ja', LegalDoc> = {
  en: {
    title: 'Account deletion guide',
    version: accountDeletionGuide.version,
    status: 'Published August 4, 2026',
    intro: 'How to delete your CheeseMoa account, and which data is deleted or retained.',
    sections: [
      {
        heading: 'How to delete your account',
        body: [
          'You can delete your account in the CheeseMoa app or on the web (app.cheese-moa.com) by following these steps. If you have uninstalled the app, you can still use the same steps in a web browser.',
          [
            'Sign in to CheeseMoa with the social account you used to register.',
            'Open Settings (⚙) at the top right of the home screen.',
            'Tap Delete account at the bottom of the screen.',
            'Confirm by tapping Delete. Your account is deleted immediately.',
          ],
        ],
      },
      {
        heading: 'Data that is deleted',
        body: [
          'The following data is destroyed without delay when you delete your account.',
          [
            'Account information (name and linked social account information)',
            'Group memberships and join requests',
            'Person linking information',
            'Groups where you are the last administrator (or the last member of a personal group), including their photos, albums and facial feature data.',
          ],
        ],
      },
      {
        heading: 'Data that is retained and retention periods',
        body: [
          [
            'Photos and albums you uploaded to groups with other remaining members stay in those groups to maintain the albums. You can delete them yourself before leaving if you do not want them retained. When a photo or its group is deleted, the photo and its facial feature data are destroyed.',
            'Service usage records (such as sign-in records) are retained for the periods required by applicable laws, including the Korean Protection of Communications Secrets Act, and are then destroyed.',
          ],
          'For details, see section 5, Processing and retention periods, of the privacy policy.',
        ],
      },
      {
        heading: 'Contact',
        body: [
          'If you have trouble deleting your account, email cheesemoa03@gmail.com. We will review your request and handle it without delay.',
        ],
      },
    ],
  },
  ja: {
    title: 'アカウント削除のご案内',
    version: accountDeletionGuide.version,
    status: '2026年8月4日掲載',
    intro:
      'チーズモア（CheeseMoa）のアカウント削除（退会）の方法と、削除・保管されるデータをご案内します。',
    sections: [
      {
        heading: 'アカウントの削除方法',
        body: [
          'チーズモアアプリまたはウェブ（app.cheese-moa.com）で、以下の手順でアカウントを削除できます。アプリをアンインストールした後も、ウェブブラウザーから同じ手順で削除できます。',
          [
            '登録時に使用したソーシャルアカウントでチーズモアにログインします。',
            'ホーム画面右上の設定（⚙）を開きます。',
            '画面の一番下にある「アカウント削除」を押します。',
            '確認画面で「削除」を押すと、アカウントが直ちに削除されます。',
          ],
        ],
      },
      {
        heading: '削除されるデータ',
        body: [
          'アカウントを削除すると、以下のデータが遅滞なく破棄されます。',
          [
            'アカウント情報（名前、ソーシャルアカウントの連携情報）',
            'グループのメンバーシップと参加申請情報',
            '人物の紐付け情報',
            '自分が最後の管理者（個人グループでは最後のメンバー）であるグループ。グループとその中の写真・アルバム・顔の特徴データも一緒に削除されます。',
          ],
        ],
      },
      {
        heading: '保管されるデータと保管期間',
        body: [
          [
            '他のメンバーが残っているグループにアップロードした写真・アルバムは、グループの運営（アルバムの維持）のために残ります。希望しない場合は、退会前に自分で削除できます。写真またはグループが削除されると、顔の特徴データとともに破棄されます。',
            'サービス利用記録（ログイン記録など）は、韓国の通信秘密保護法などの関係法令で定める期間保管した後、破棄されます。',
          ],
          '詳しくは、プライバシーポリシーの第5項「個人情報の処理および保有期間」をご確認ください。',
        ],
      },
      {
        heading: 'お問い合わせ',
        body: [
          'アカウントを削除できない場合は、cheesemoa03@gmail.comへメールでお問い合わせください。確認後、遅滞なく対応します。',
        ],
      },
    ],
  },
}
const data: Record<'en' | 'ja', LegalDoc> = {
  en: {
    title: 'Data deletion guide',
    version: dataDeletionGuide.version,
    status: 'Published August 4, 2026',
    intro:
      'How to delete some of your data while keeping your CheeseMoa account. To delete the account itself, see the account deletion guide.',
    sections: [
      {
        heading: 'Data you can delete yourself',
        body: [
          'Sign in to the CheeseMoa app or website (app.cheese-moa.com) to delete the following data. Deletions take effect immediately.',
          [
            'Photos and albums: select and delete photos or delete an album from an event’s album screen. Deleting a photo also destroys the facial feature data generated from that photo.',
            'Group membership: select Leave group in Settings (⚙) on the group screen.',
            'Person linking information: an administrator of a business group can unlink it from the invitation screen.',
          ],
        ],
      },
      {
        heading: 'Requesting deletion by email',
        body: [
          'You can request deletion by emailing cheesemoa03@gmail.com in the following cases. We will verify that the requester is the person concerned or their authorized representative, then handle the request without delay.',
          [
            'Deleting data that is difficult to delete in the app.',
            'A person shown in a photo who is not a service member, or their guardian, requesting deletion of their photos and facial feature data.',
          ],
        ],
      },
      {
        heading: 'Data that is retained and retention periods',
        body: [
          [
            'Photos, facial feature data and person information are retained until the photo or group is deleted.',
            'Service usage records (such as sign-in records) are retained for the periods required by applicable laws, including the Korean Protection of Communications Secrets Act, and are then destroyed.',
          ],
          'For details, see section 5, Processing and retention periods, of the privacy policy.',
        ],
      },
    ],
  },
  ja: {
    title: 'データ削除のご案内',
    version: dataDeletionGuide.version,
    status: '2026年8月4日掲載',
    intro:
      'チーズモア（CheeseMoa）のアカウントを維持したまま、一部のデータだけを削除する方法をご案内します。アカウント自体を削除する場合は、アカウント削除のご案内をご確認ください。',
    sections: [
      {
        heading: 'アプリで自分で削除できるデータ',
        body: [
          'チーズモアアプリまたはウェブ（app.cheese-moa.com）にログインすると、以下のデータを自分で削除できます。削除は直ちに反映されます。',
          [
            '写真・アルバム：イベントのアルバム画面で写真を選んで削除するか、アルバムを削除できます。写真を削除すると、その写真から生成された顔の特徴データも破棄されます。',
            'グループのメンバーシップ：グループ画面の設定（⚙）から「グループを退出」を選ぶと退出できます。',
            '人物の紐付け情報：ビジネスグループの管理者が招待画面で紐付けを解除できます。',
          ],
        ],
      },
      {
        heading: 'メールで削除を依頼する場合',
        body: [
          '以下の場合は、cheesemoa03@gmail.comへメールで削除を依頼できます。依頼者が本人または正当な代理人であることを確認した後、遅滞なく対応します。',
          [
            'アプリで直接削除することが難しいデータの削除。',
            'サービス会員ではない写真に写った本人（被写体）またはその保護者による、写真・顔の特徴データの削除依頼。',
          ],
        ],
      },
      {
        heading: '保管されるデータと保管期間',
        body: [
          [
            '写真・顔の特徴データ・人物情報は、写真またはグループが削除されるまで保管されます。',
            'サービス利用記録（ログイン記録など）は、韓国の通信秘密保護法などの関係法令で定める期間保管した後、破棄されます。',
          ],
          '詳しくは、プライバシーポリシーの第5項「個人情報の処理および保有期間」をご確認ください。',
        ],
      },
    ],
  },
}
export function deletionGuide(kind: 'account' | 'data', locale: PublicLocale): LegalDoc {
  if (locale === 'ko') return kind === 'account' ? accountDeletionGuide : dataDeletionGuide
  return (kind === 'account' ? account : data)[locale]
}
