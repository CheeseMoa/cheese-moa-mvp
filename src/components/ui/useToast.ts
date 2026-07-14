import { useContext } from 'react'
import { ToastContext, type ToastContextValue } from './toastContext'

/** 토스트 훅 — <ToastProvider> 하위에서만 사용 가능 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast는 <ToastProvider> 안에서만 사용할 수 있습니다')
  return ctx
}
