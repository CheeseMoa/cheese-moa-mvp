import { useRef, useState } from 'react'
import { useToast } from '../components/ui'
import { useAlive } from './useAlive'
import {
  downloadEach,
  downloadPreparedFiles,
  fetchAsFiles,
  shareFiles,
  shareSaveSupported,
  splitIntoBatches,
  type PhotoSaveItem,
} from '../lib/photoSave'

/**
 * 사진 앨범 저장 상태머신 (CHMO-473) — 라이트박스·09·16·19 공용.
 *
 * iOS(공유 시트 경로)는 2단계다: `start` 탭 → 첫 배치 선요청(preparing) → 준비 끝나면 즉시
 * 공유를 한 번 시도하고(제스처가 살아 있으면 탭 절약), transient activation 만료(blocked)면
 * ready로 남아 [사진 앱에 저장] 재탭(`shareNext`)을 기다린다.
 *
 * 준비는 **배치 단위**다(메모리 피크 = 배치 1~2개, 총량 아님): 아이템을 먼저 나누고 File은
 * 필요한 배치만 받되, ready에 들어가면 시트가 떠 있는 동안 다음 배치를 미리 받아 배치 간
 * 대기를 상쇄한다. 수동 탭이 연속 2회 거부되면(인앱 브라우저 등 공유가 막힌 환경) 준비분을
 * 재사용해 파일 다운로드로 폴백한다(iOS는 파일 앱행 — 토스트로 도착지를 알린다).
 * 그 외 플랫폼은 `start` 한 번에 장별 다운로드(downloading)로 끝난다.
 */
export type PhotoSaveState =
  | { phase: 'idle' }
  | { phase: 'preparing'; done: number; total: number }
  | { phase: 'ready'; batchIndex: number; batchCount: number }
  | { phase: 'downloading'; done: number; total: number }

/** 진행 중 상태의 버튼 라벨 단일 원천 — idle이면 null(호출부 기본 라벨) */
export function photoSaveLabel(state: PhotoSaveState): string | null {
  switch (state.phase) {
    case 'idle':
      return null
    case 'preparing':
      return `사진 준비 중 ${state.done}/${state.total}`
    case 'downloading':
      return `저장 중 ${state.done}/${state.total}`
    case 'ready':
      return state.batchCount > 1
        ? `사진 앱에 저장 (${state.batchIndex + 1}/${state.batchCount})`
        : '사진 앱에 저장'
  }
}

export function usePhotoSave() {
  const toast = useToast()
  const alive = useAlive()
  const [state, setState] = useState<PhotoSaveState>({ phase: 'idle' })
  // 배치 준비물 — 리렌더와 무관한 저장물이라 ref. slots는 시작된 fetch의 promise(프리페치와
  // 본요청이 공유·중복 방지), resolved는 완료분(준비 끝난 배치의 preparing 깜빡임 방지)
  const itemBatchesRef = useRef<PhotoSaveItem[][]>([])
  const slotsRef = useRef<(Promise<File[]> | undefined)[]>([])
  const resolvedRef = useRef<(File[] | undefined)[]>([])
  const progressRef = useRef<number[]>([])
  // 진행률 UI를 소유한 배치 — 프리페치는 조용히 받고 화면이 기다리는 배치만 상태를 올린다
  const visibleRef = useRef(-1)
  const fetchFailedRef = useRef(0)
  const savedRef = useRef(0)
  // 수동 탭 연속 거부 수 — 2회면 공유가 막힌 환경으로 보고 파일 다운로드 폴백
  const tapFailedRef = useRef(0)
  // 시트가 뜨는 중 재탭으로 share()가 겹치면 두 번째가 실패로 집계돼 폴백 카운트를 오염시킨다
  const sharingRef = useRef(false)
  // 실행 세대 — reset(사진 전환 등) 뒤 뒤늦게 끝난 선요청이 새 상태를 덮지 않게 한다
  const runRef = useRef(0)

  /** 탭을 더 받을 수 없는 진행 중 상태 — ready는 [사진 앱에 저장] 탭을 기다리므로 제외 */
  const busy = state.phase === 'preparing' || state.phase === 'downloading'

  const reset = () => {
    runRef.current += 1
    itemBatchesRef.current = []
    slotsRef.current = []
    resolvedRef.current = []
    setState({ phase: 'idle' })
  }

  const ok = (run: number) => alive.current && runRef.current === run

  /** 배치 fetch를 시작하거나 진행 중인 것을 재사용한다 — 실패 장수는 누계로 모은다 */
  const ensureBatch = (run: number, index: number): Promise<File[]> => {
    const existing = slotsRef.current[index]
    if (existing) return existing
    const items = itemBatchesRef.current[index]
    const promise = fetchAsFiles(items, (done) => {
      // run 가드 — reset 뒤 늦게 오는 진행/완료가 새 실행의 준비물·진행률을 오염시키지 않게
      if (!ok(run)) return
      progressRef.current[index] = done
      if (visibleRef.current === index) {
        setState({ phase: 'preparing', done, total: items.length })
      }
    }).then(({ files, failed }) => {
      if (runRef.current === run) {
        fetchFailedRef.current += failed
        resolvedRef.current[index] = files
      }
      return files
    })
    slotsRef.current[index] = promise
    return promise
  }

  /** index 배치가 준비될 때까지 진행률을 보여주며 기다린다 — 이미 준비됐으면 즉시 */
  const awaitBatch = async (run: number, index: number): Promise<File[] | null> => {
    const done = resolvedRef.current[index]
    if (done) return done
    visibleRef.current = index
    setState({
      phase: 'preparing',
      done: progressRef.current[index] ?? 0,
      total: itemBatchesRef.current[index].length,
    })
    const files = await ensureBatch(run, index)
    return ok(run) ? files : null
  }

  /** ready 진입 — 시트가 떠 있는(탭을 기다리는) 동안 다음 배치를 미리 받아둔다 */
  const setReady = (run: number, index: number) => {
    const count = itemBatchesRef.current.length
    setState({ phase: 'ready', batchIndex: index, batchCount: count })
    if (index + 1 < count) void ensureBatch(run, index + 1)
  }

  /** 공유 경로 종료 — 부분 실패(fetch 못 받은 장수)까지 한 번에 알린다 */
  const finish = () => {
    const failed = fetchFailedRef.current
    toast.show(
      failed === 0
        ? `🧀 사진 ${savedRef.current}장을 저장했어요`
        : `사진 ${savedRef.current}장 저장 · ${failed}장은 받지 못했어요`,
    )
    reset()
  }

  /**
   * 공유가 막힌 환경의 폴백 — 남은 배치를 준비분은 재사용·미준비분은 이때 받아서
   * 파일 다운로드로 흘린다(iOS는 파일 앱 '다운로드'행 — 사진 앱이 아니라 도착지를 알린다).
   */
  const fallbackToDownload = async (run: number, fromIndex: number) => {
    toast.show('사진 앱을 열 수 없어 파일로 저장할게요')
    const batches = itemBatchesRef.current
    const total = batches.slice(fromIndex).reduce((n, b) => n + b.length, 0)
    let done = 0
    setState({ phase: 'downloading', done, total })
    for (let i = fromIndex; i < batches.length; i += 1) {
      const files = await ensureBatch(run, i)
      if (!ok(run)) return
      await downloadPreparedFiles(files, () => {
        done += 1
        if (ok(run)) setState({ phase: 'downloading', done, total })
      })
      if (!ok(run)) return
    }
    const failed = fetchFailedRef.current
    toast.show(
      failed === 0
        ? `🧀 ${done}장을 파일 앱(다운로드)에 저장했어요`
        : `${done}장을 파일 앱(다운로드)에 저장 · ${failed}장은 받지 못했어요`,
    )
    reset()
  }

  const shareBatch = async (run: number, index: number, auto: boolean) => {
    if (sharingRef.current) return
    sharingRef.current = true
    try {
      await shareBatchInner(run, index, auto)
    } finally {
      sharingRef.current = false
    }
  }

  const shareBatchInner = async (run: number, index: number, auto: boolean) => {
    const files = await ensureBatch(run, index)
    if (!ok(run)) return
    if (files.length === 0) {
      // 이 배치가 전멸(전 장 fetch 실패) — 부분 진행분만 남기고 종료
      if (savedRef.current === 0 && index === 0) toast.show('저장하지 못했어요. 다시 시도해 주세요.')
      else finish()
      if (runRef.current === run) reset()
      return
    }
    const outcome = await shareFiles(files)
    if (!ok(run)) return
    switch (outcome) {
      case 'shared': {
        tapFailedRef.current = 0
        savedRef.current += files.length
        const next = index + 1
        if (next >= itemBatchesRef.current.length) {
          finish()
          return
        }
        const nextFiles = await awaitBatch(run, next)
        if (nextFiles === null) return
        if (nextFiles.length === 0) {
          finish()
          return
        }
        setReady(run, next)
        return
      }
      case 'canceled':
        // 시트 닫기 = 정상 취소 — 같은 배치에서 대기(재탭으로 재개), 토스트 금지
        tapFailedRef.current = 0
        setReady(run, index)
        return
      case 'blocked':
      case 'failed':
        if (auto) {
          // 자동 시도의 만료는 예정된 경로(선요청이 길면 필연) — 재탭 안내만
          setReady(run, index)
          toast.show('사진이 준비됐어요. 사진 앱에 저장을 탭해 주세요')
          return
        }
        tapFailedRef.current += 1
        if (tapFailedRef.current >= 2) {
          // 직접 탭인데도 연속 거부 — 인앱 브라우저 등 공유가 막힌 환경으로 보고 폴백
          void fallbackToDownload(run, index)
          return
        }
        setReady(run, index)
        toast.show('저장하지 못했어요. 한 번 더 탭해 주세요.')
        return
    }
  }

  /** ready 상태의 [사진 앱에 저장] 탭 — 현재 배치의 공유 시트를 연다 */
  const shareNext = () => {
    if (state.phase !== 'ready') return
    void shareBatch(runRef.current, state.batchIndex, false)
  }

  /** 저장 시작 — iOS는 배치 선요청→공유 시트, 그 외는 장별 다운로드 */
  const start = async (items: PhotoSaveItem[]) => {
    if (state.phase !== 'idle' || items.length === 0) return
    const run = ++runRef.current
    fetchFailedRef.current = 0
    savedRef.current = 0
    tapFailedRef.current = 0
    progressRef.current = []
    visibleRef.current = -1

    if (shareSaveSupported()) {
      itemBatchesRef.current = splitIntoBatches(items)
      slotsRef.current = []
      resolvedRef.current = []
      const files = await awaitBatch(run, 0)
      if (files === null) return
      if (files.length === 0) {
        toast.show('저장하지 못했어요. 다시 시도해 주세요.')
        reset()
        return
      }
      setReady(run, 0)
      await shareBatch(run, 0, true)
      return
    }

    // Android Chrome은 두 번째 장부터 '여러 파일 다운로드 허용'을 묻는다 — 시작 전에 안내
    if (items.length > 1) toast.show('브라우저가 다운로드 허용을 물으면 허용해 주세요')
    setState({ phase: 'downloading', done: 0, total: items.length })
    const failed = await downloadEach(items, (done, total) => {
      if (ok(run)) setState({ phase: 'downloading', done, total })
    })
    if (!ok(run)) return
    if (failed > 0) {
      toast.show(`${failed}장은 저장하지 못했어요. 다시 시도해 주세요.`)
    } else if (items.length > 1) {
      // 한 장 저장은 브라우저 저장 동작 자체가 피드백이라 침묵(라이트박스 기존 규칙)
      toast.show(`🧀 ${items.length}장 저장을 시작했어요`)
    }
    reset()
  }

  return { state, busy, start, shareNext, reset }
}
