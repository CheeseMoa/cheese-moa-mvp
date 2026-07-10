/**
 * 동시 실행 수를 `limit`으로 묶어 `items`를 처리한다.
 *
 * 06-U는 고른 사진 수만큼 S3 PUT을 띄우는데, 수백 장을 한꺼번에 던지면 브라우저 커넥션이
 * 고갈되고 실패 시 취소해야 할 요청도 그만큼 늘어난다.
 *
 * 하나라도 실패하면 그 예외로 reject한다(첫 실패 기준). 호출부가 `signal`을 끊으면
 * 남은 작업은 새로 시작되지 않는다.
 */
export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let cursor = 0
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      if (signal?.aborted) return
      const index = cursor++
      await task(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}
