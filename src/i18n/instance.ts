import { createInstance } from 'i18next'
import ko from './ko.json'
import en from './en.json'
import ja from './ja.json'
import { PUBLIC_LOCALES } from './locale'
import type { PublicLocale } from './locale'

export const publicResources = { ko, en, ja }

export function createPublicI18n(locale: PublicLocale) {
  const instance = createInstance()
  // 번들에 포함된 리소스만 사용하므로 동기 초기화. 본체·어드민의 전역 상태는 건드리지 않는다.
  void instance.init({
    lng: locale,
    fallbackLng: 'en',
    supportedLngs: [...PUBLIC_LOCALES],
    resources: { ko: { translation: ko }, en: { translation: en }, ja: { translation: ja } },
    initAsync: false,
    interpolation: { escapeValue: false }, // React가 텍스트를 이스케이프한다.
  })
  return instance
}
