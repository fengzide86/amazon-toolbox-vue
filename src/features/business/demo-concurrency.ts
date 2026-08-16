export type DemoSimulatedOutcome = 'completed_example' | 'attention_example' | 'failure_example'

export interface DemoProgressUpdate {
  itemId: string
  progressPercent: number
  stageIndex: number
  startedAtMs: number
}

export interface DemoCompletion extends DemoProgressUpdate {
  finishedAtMs: number
  outcome: DemoSimulatedOutcome
}

interface DemoSchedule {
  itemId: string
  durationMs: number
  outcome: DemoSimulatedOutcome
  startedAtMs: number
  progressPercent: number
  completing: boolean
}

export interface DemoConcurrencyCallbacks {
  onProgress(updates: DemoProgressUpdate[]): void
  onItemComplete(completion: DemoCompletion): Promise<void>
  onComplete(): Promise<void>
  onError(error: unknown): void
}

export interface DemoConcurrencyOptions {
  tickMs?: number
  durationForIndex?: (index: number) => number
  now?: () => number
}

function outcomeForIndex(index: number): DemoSimulatedOutcome {
  if (index % 4 === 2) return 'attention_example'
  if (index % 5 === 4) return 'failure_example'
  return 'completed_example'
}

function stageForProgress(progressPercent: number): number {
  if (progressPercent < 22) return 0
  if (progressPercent < 62) return 1
  if (progressPercent < 88) return 2
  return 3
}

export class DemoConcurrencyController {
  private readonly tickMs: number
  private readonly durationForIndex: (index: number) => number
  private readonly now: () => number
  private timer: ReturnType<typeof setInterval> | null = null
  private schedules: DemoSchedule[] = []
  private completionPromises: Promise<void>[] = []
  private generation = 0
  private completingBatch = false

  constructor(
    private readonly callbacks: DemoConcurrencyCallbacks,
    options: DemoConcurrencyOptions = {},
  ) {
    this.tickMs = options.tickMs ?? 160
    this.durationForIndex = options.durationForIndex ?? (index => 2_500 + (index % 7) * 280)
    this.now = options.now ?? (() => Date.now())
  }

  start(itemIds: string[]): void {
    this.stop()
    const generation = this.generation
    const startedAtMs = this.now()
    this.schedules = itemIds.map((itemId, index) => ({
      itemId,
      durationMs: Math.max(400, this.durationForIndex(index)),
      outcome: outcomeForIndex(index),
      startedAtMs,
      progressPercent: 0,
      completing: false,
    }))
    this.completingBatch = false
    this.callbacks.onProgress(this.schedules.map(schedule => ({
      itemId: schedule.itemId,
      progressPercent: 4,
      stageIndex: 0,
      startedAtMs,
    })))
    if (!this.schedules.length) {
      this.completingBatch = true
      void this.callbacks.onComplete().catch(error => this.callbacks.onError(error))
      return
    }
    this.timer = setInterval(() => this.tick(generation), this.tickMs)
  }

  stop(): string[] {
    this.generation += 1
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    const unfinished = this.schedules.filter(schedule => !schedule.completing).map(schedule => schedule.itemId)
    this.schedules = []
    this.completionPromises = []
    this.completingBatch = false
    return unfinished
  }

  activeItemIds(): string[] {
    return this.schedules.filter(schedule => !schedule.completing).map(schedule => schedule.itemId)
  }

  private tick(generation: number): void {
    if (generation !== this.generation) return
    const now = this.now()
    const progressUpdates: DemoProgressUpdate[] = []

    for (const schedule of this.schedules) {
      if (schedule.completing) continue
      const elapsed = Math.max(0, now - schedule.startedAtMs)
      const progressPercent = Math.min(100, Math.max(4, Math.round((elapsed / schedule.durationMs) * 100)))
      if (progressPercent !== schedule.progressPercent) {
        schedule.progressPercent = progressPercent
        progressUpdates.push({
          itemId: schedule.itemId,
          progressPercent,
          stageIndex: stageForProgress(progressPercent),
          startedAtMs: schedule.startedAtMs,
        })
      }
      if (progressPercent < 100) continue

      schedule.completing = true
      const completion: DemoCompletion = {
        itemId: schedule.itemId,
        progressPercent: 100,
        stageIndex: 3,
        startedAtMs: schedule.startedAtMs,
        finishedAtMs: now,
        outcome: schedule.outcome,
      }
      const completionPromise = this.callbacks.onItemComplete(completion)
        .catch(error => {
          if (generation === this.generation) this.fail(error)
          throw error
        })
      this.completionPromises.push(completionPromise)
    }

    if (progressUpdates.length) this.callbacks.onProgress(progressUpdates)
    if (this.completingBatch || this.schedules.some(schedule => !schedule.completing)) return

    this.completingBatch = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    void Promise.all(this.completionPromises)
      .then(() => {
        if (generation === this.generation) return this.callbacks.onComplete()
        return undefined
      })
      .catch(error => {
        if (generation === this.generation) this.fail(error)
      })
  }

  private fail(error: unknown): void {
    this.stop()
    this.callbacks.onError(error)
  }
}
