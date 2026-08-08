/**
 * Declarations for browser features that are not in the standard DOM library:
 * the Web Speech API, which ships unprefixed only in some engines, and the
 * built-in prompt API, which is Chrome specific.
 */

declare global {
  interface SpeechRecognitionEventLike extends Event {
    readonly resultIndex: number
    readonly results: SpeechRecognitionResultList
  }

  interface SpeechRecognitionErrorEventLike extends Event {
    readonly error: string
    readonly message: string
  }

  interface SpeechRecognitionLike extends EventTarget {
    continuous: boolean
    interimResults: boolean
    lang: string
    maxAlternatives: number
    start(): void
    stop(): void
    abort(): void
    onresult: ((event: SpeechRecognitionEventLike) => void) | null
    onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
    onend: (() => void) | null
    onstart: (() => void) | null
  }

  type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

  type LanguageModelAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available'

  interface LanguageModelSession {
    prompt(input: string, options?: { signal?: AbortSignal }): Promise<string>
    clone(options?: { signal?: AbortSignal }): Promise<LanguageModelSession>
    destroy(): void
  }

  interface LanguageModelInitialPrompt {
    role: 'system' | 'user' | 'assistant'
    content: string
  }

  interface LanguageModelCreateOptions {
    temperature?: number
    topK?: number
    initialPrompts?: LanguageModelInitialPrompt[]
    signal?: AbortSignal
  }

  interface LanguageModelStatic {
    availability(): Promise<LanguageModelAvailability>
    create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>
  }

  var SpeechRecognition: SpeechRecognitionConstructor | undefined
  var webkitSpeechRecognition: SpeechRecognitionConstructor | undefined
  var LanguageModel: LanguageModelStatic | undefined
}

export {}
