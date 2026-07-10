import { describe, expect, it } from 'vitest'
import { PIN_RE, sanitizePinInput } from './pin'

/** UI(PinField)와 MSW 목이 같은 규칙을 봐야 한다 — 어긋나면 목에선 되고 실 BE에선 AUTH400 */
describe('PIN_RE', () => {
  it('숫자 4자리만 통과한다', () => {
    expect(PIN_RE.test('1234')).toBe(true)
    expect(PIN_RE.test('0000')).toBe(true)
  })

  it('길이·문자 종류가 어긋나면 거절한다', () => {
    expect(PIN_RE.test('123')).toBe(false)
    expect(PIN_RE.test('12345')).toBe(false)
    expect(PIN_RE.test('12a4')).toBe(false)
    expect(PIN_RE.test('')).toBe(false)
  })
})

describe('sanitizePinInput', () => {
  it('숫자가 아닌 문자를 버리고 4자리로 자른다', () => {
    expect(sanitizePinInput('12a3b4')).toBe('1234')
    expect(sanitizePinInput('1234-5678')).toBe('1234')
    expect(sanitizePinInput('  12 34  ')).toBe('1234')
    expect(sanitizePinInput('abcd')).toBe('')
  })
})
