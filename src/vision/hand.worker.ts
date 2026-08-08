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

/** The only shape the main thread ever sees. Landmarks stay in the worker. */
export interface HandSample {
  readonly type: 'sample'
  /** Normalised to the video frame, already mirrored to match the viewer. */
  readonly x: number
  readonly y: number
  /** Normalised distance between thumb tip and index tip. */
  readonly pinch: number
  readonly confidence: number
}

export type HandResponse =
  HandSample | { readonly type: 'ready' } | { readonly type: 'error'; readonly message: string }

const THUMB_TIP = 4
const INDEX_TIP = 8

const smoothed = new OneEuroPoint()
let landmarker: HandLandmarker | null = null
let lastTimestamp = -1

function post(message: HandResponse): void {
  postMessage(message)
}

async function init(request: HandInitRequest): Promise<void> {
  const fileset = await FilesetResolver.forVisionTasks(request.wasmPath)
  landmarker = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: request.modelPath, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 1,
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
    const hand = result.landmarks[0]
    const thumb = hand?.[THUMB_TIP]
    const index = hand?.[INDEX_TIP]
    const confidence = result.handedness[0]?.[0]?.score ?? 0

    if (thumb === undefined || index === undefined) {
      smoothed.reset()
      post({ type: 'sample', x: 0, y: 0, pinch: 1, confidence: 0 })
      return
    }

    // The cursor sits between the two pinching fingers, so closing the pinch
    // does not drag the cursor off the thing being grabbed.
    const raw = smoothed.filter((thumb.x + index.x) / 2, (thumb.y + index.y) / 2, timestamp)
    const pinch = Math.hypot(thumb.x - index.x, thumb.y - index.y)

    post({ type: 'sample', x: 1 - raw.x, y: raw.y, pinch, confidence })
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
      smoothed.reset()
      lastTimestamp = -1
      return
  }
}
