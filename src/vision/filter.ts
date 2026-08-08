import { ONE_EURO_BETA, ONE_EURO_D_CUTOFF, ONE_EURO_MIN_CUTOFF } from '../tuning'

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff)
  return 1 / (1 + tau / dt)
}

class LowPass {
  private value: number | null = null

  filter(input: number, a: number): number {
    const previous = this.value
    const next = previous === null ? input : a * input + (1 - a) * previous
    this.value = next
    return next
  }

  get last(): number | null {
    return this.value
  }

  reset(): void {
    this.value = null
  }
}

/**
 * A moving average or a fixed lerp forces one choice for the whole gesture:
 * smooth enough to hold still, or responsive enough to move fast, never both.
 * The One Euro filter varies its cutoff with the observed speed, so a hand held
 * over a block stops shaking while a fast reach across the canvas keeps up.
 */
export class OneEuroFilter {
  private readonly minCutoff: number
  private readonly beta: number
  private readonly dCutoff: number
  private readonly value = new LowPass()
  private readonly derivative = new LowPass()
  private lastTime: number | null = null

  constructor(
    minCutoff: number = ONE_EURO_MIN_CUTOFF,
    beta: number = ONE_EURO_BETA,
    dCutoff: number = ONE_EURO_D_CUTOFF,
  ) {
    this.minCutoff = minCutoff
    this.beta = beta
    this.dCutoff = dCutoff
  }

  filter(input: number, timestamp: number): number {
    const previousTime = this.lastTime
    this.lastTime = timestamp

    // The first sample has no interval to measure against, so it passes through.
    if (previousTime === null) {
      this.derivative.filter(0, 1)
      return this.value.filter(input, 1)
    }

    const dt = Math.max((timestamp - previousTime) / 1000, 1e-4)
    const previous = this.value.last
    const rate = previous === null ? 0 : (input - previous) / dt
    const speed = Math.abs(this.derivative.filter(rate, alpha(this.dCutoff, dt)))
    const cutoff = this.minCutoff + this.beta * speed
    return this.value.filter(input, alpha(cutoff, dt))
  }

  reset(): void {
    this.value.reset()
    this.derivative.reset()
    this.lastTime = null
  }
}

/** Two independent filters, one per axis. */
export class OneEuroPoint {
  private readonly x = new OneEuroFilter()
  private readonly y = new OneEuroFilter()

  filter(x: number, y: number, timestamp: number): { x: number; y: number } {
    return { x: this.x.filter(x, timestamp), y: this.y.filter(y, timestamp) }
  }

  reset(): void {
    this.x.reset()
    this.y.reset()
  }
}
