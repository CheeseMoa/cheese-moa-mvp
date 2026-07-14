import { createContext } from 'react'

export interface ToastContextValue {
  /** 하단 중앙 토스트 표시 — 전역 1개, 자동 사라짐 (dc.html §10) */
  show: (message: string) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)
