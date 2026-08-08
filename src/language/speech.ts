import { VOICE_PAUSE_MS } from '../tuning'

export type SpeechStatus = 'unavailable' | 'idle' | 'listening'

export interface SpeechOptions {
  readonly lang?: string
  readonly onUtterance: (text: string) => void
  readonly onStatus?: (status: SpeechStatus) => void
  readonly onError?: (message: string) => void
}

function recognitionConstructor(): SpeechRecognitionConstructor | undefined {
  return globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition
}

export function isSpeechSupported(): boolean {
  return recognitionConstructor() !== undefined
}

/**
 * A thin wrapper over the Web Speech API. It never starts on its own: the
 * microphone opens only from an explicit call, which the toolbar toggle makes.
 */
export class SpeechInput {
  private readonly options: SpeechOptions
  private recognition: SpeechRecognitionLike | null = null
  private pauseTimer: number | null = null
  private pendingText = ''
  private lastEmitted = ''
  private wanted = false

  constructor(options: SpeechOptions) {
    this.options = options
  }

  get listening(): boolean {
    return this.wanted
  }

  start(): void {
    if (this.wanted) return
    const Recognition = recognitionConstructor()
    if (Recognition === undefined) {
      this.options.onStatus?.('unavailable')
      return
    }

    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = this.options.lang ?? 'en-US'
    recognition.maxAlternatives = 1
    recognition.onresult = event => {
      this.handleResult(event)
    }
    recognition.onerror = event => {
      this.options.onError?.(event.error)
    }
    recognition.onend = () => {
      // The recogniser stops itself after a stretch of silence. Restart it while
      // the user still has the microphone switched on.
      if (this.wanted) recognition.start()
      else this.options.onStatus?.('idle')
    }

    this.recognition = recognition
    this.wanted = true
    recognition.start()
    this.options.onStatus?.('listening')
  }

  stop(): void {
    this.wanted = false
    this.clearPause()
    this.pendingText = ''
    this.lastEmitted = ''
    this.recognition?.stop()
    this.recognition = null
    this.options.onStatus?.('idle')
  }

  /**
   * Interim results are parsed as soon as speech pauses rather than waiting for
   * the final result. The recogniser only marks a result final well after the
   * speaker has stopped, and that wait is plainly visible in an editor where the
   * effect is meant to land as you say it.
   */
  private handleResult(event: SpeechRecognitionEventLike): void {
    let interim = ''
    let final = ''
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i]
      const alternative = result?.[0]
      if (result === undefined || alternative === undefined) continue
      if (result.isFinal) final += alternative.transcript
      else interim += alternative.transcript
    }

    if (final.trim().length > 0) {
      this.clearPause()
      this.emit(final)
      return
    }

    if (interim.trim().length === 0) return
    this.pendingText = interim
    this.clearPause()
    this.pauseTimer = globalThis.setTimeout(() => {
      this.pauseTimer = null
      this.emit(this.pendingText)
    }, VOICE_PAUSE_MS)
  }

  private emit(text: string): void {
    const cleaned = text.trim()
    if (cleaned.length === 0 || cleaned === this.lastEmitted) return
    this.lastEmitted = cleaned
    this.options.onUtterance(cleaned)
  }

  private clearPause(): void {
    if (this.pauseTimer !== null) globalThis.clearTimeout(this.pauseTimer)
    this.pauseTimer = null
  }
}
