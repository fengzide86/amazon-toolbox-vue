export type AsyncDataState = 'idle' | 'loading' | 'data' | 'empty' | 'error' | 'stale'

export function settledDataState(itemCount: number): AsyncDataState {
  return itemCount > 0 ? 'data' : 'empty'
}

export function failedDataState(hasUsableData: boolean): AsyncDataState {
  return hasUsableData ? 'stale' : 'error'
}
