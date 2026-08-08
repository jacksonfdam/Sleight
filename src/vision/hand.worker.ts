import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { OneEuroPoint } from './filter'

export interface HandInitRequest {
  readonly type: 'init'
  readonly wasmPath: string
  readonly modelPath: string
}

export interface HandFrameRequest {
  readonly type: 'frame'
  readonly bitmap: ImageBitmap
  readonly timestamp: number
}

export interface HandStopRequest {
  readonly type: 'stop'
}

export type HandRequest = HandInitRequest | HandFrameRequest | HandStopRequest

/** Which physical hand a point came from, used to keep filters separate. */
export type HandLabel = 'Left' | 'Right'

export interface HandPoint {
  readonly label: HandLabel
  /** Normalised to the video frame, already mirrored to match the viewer. */
  readonly x: number
  readonly y: number
  /** Normalised distance between thumb tip and index tip. */
  readonly pinch: number
  readonly confidence: number
}

/** The only shape the main thread ever sees. Landmarks stay in the worker. */
export interface HandSample {
  readonly type: 'sample'
  readonly hands: readonly HandPoint[]
}

export type HandResponse =
  HandSample | { readonly type: 'ready' } | { readonly type: 'error'; readonly message: string }

const THUMB_TIP = 4
const INDEX_TIP = 8

/**
 * One filter per hand, keyed by handedness. A shared filter would make each hand
 * yank the other's smoothed position every time they swap places in the result
 * list, which happens constantly when both are in frame.
 */
const smoothed = new Map<HandLabel, OneEuroPoint>()
let landmarker: HandLandmarker | null = null
let lastTimestamp = -1

function post(message: HandResponse): void {
  postMessage(message)
}

function filterFor(label: HandLabel): OneEuroPoint {
  const existing = smoothed.get(label)
  if (existing !== undefined) return existing
  const created = new OneEuroPoint()
  smoothed.set(label, created)
  return created
}

function resetFilters(): void {
  for (const filter of smoothed.values()) filter.reset()
}

async function init(request: HandInitRequest): Promise<void> {
  // The second argument selects the ES module build of the WebAssembly runtime.
  // This runs as a module worker, where importScripts does not exist, and the
  // non-module runtime is CommonJS and cannot be imported at all.
  const fileset = await FilesetResolver.forVisionTasks(request.wasmPath, true)
  landmarker = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: request.modelPath, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 2,
  })
  post({ type: 'ready' })
}

function detect(request: HandFrameRequest): void {
  const model = landmarker
  if (model === null) {
    request.bitmap.close()
    return
  }

  // The task rejects a timestamp that does not advance.
  const timestamp = request.timestamp <= lastTimestamp ? lastTimestamp + 1 : request.timestamp
  lastTimestamp = timestamp

  try {
    const result = model.detectForVideo(request.bitmap, timestamp)
    const hands: HandPoint[] = []
    const seen = new Set<HandLabel>()

    for (const [index, landmarks] of result.landmarks.entries()) {
      const thumb = landmarks[THUMB_TIP]
      const finger = landmarks[INDEX_TIP]
      if (thumb === undefined || finger === undefined) continue

      const category = result.handedness[index]?.[0]
      const label: HandLabel = category?.categoryName === 'Left' ? 'Left' : 'Right'
      // Two detections reporting the same hand would share one filter, so the
      // second is dropped rather than left to fight the first.
      if (seen.has(label)) continue
      seen.add(label)

      // The cursor sits between the two pinching fingers, so closing the pinch
      // does not drag the cursor off the thing being grabbed.
      const point = filterFor(label).filter(
        (thumb.x + finger.x) / 2,
        (thumb.y + finger.y) / 2,
        timestamp,
      )
      hands.push({
        label,
        x: 1 - point.x,
        y: point.y,
        pinch: Math.hypot(thumb.x - finger.x, thumb.y - finger.y),
        confidence: category?.score ?? 0,
      })
    }

    // A hand that left the frame must forget its history, or it will snap across
    // the canvas when it returns.
    for (const [label, filter] of smoothed) {
      if (!seen.has(label)) filter.reset()
    }

    post({ type: 'sample', hands })
  } finally {
    request.bitmap.close()
  }
}

self.onmessage = (event: MessageEvent<HandRequest>): void => {
  const request = event.data
  switch (request.type) {
    case 'init':
      init(request).catch((error: unknown) => {
        post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
      })
      return
    case 'frame':
      detect(request)
      return
    case 'stop':
      landmarker?.close()
      landmarker = null
      resetFilters()
      lastTimestamp = -1
      return
  }
}
