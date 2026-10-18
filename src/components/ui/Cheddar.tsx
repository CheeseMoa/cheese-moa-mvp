import albumUrl from '../../assets/brand/album.png'
import { cx } from '../../lib/cx'

interface CheddarProps {
  size?: number
  className?: string
}

/**
 * 공용 책 로고. 앱 assets/brand/album_512.png의 Chz 문구 없는 정본을 사용한다.
 * 어드민·공개 페이지·빈 상태까지 같은 자산을 참조하며, 원본 비율을 유지한다.
 * Cheddar 이름은 기존 호출부 호환을 위해 유지한다.
 */
export function Cheddar({ size = 30, className }: CheddarProps) {
  return (
    <img
      src={albumUrl}
      width={size}
      height={size}
      className={cx('object-contain', className)}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  )
}
