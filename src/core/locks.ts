import { LOCK_TTL_MS } from '../tuning'
import type { Command, PropPath } from './types'

export type PropGroup = 'geom' | 'style' | 'content'

/**
 * Concurrency is resolved per property group. Two sources editing the same block
 * only contend when they reach for the same group, which is why a pinch resize
 * and a spoken colour change can land at the same moment.
 */
export const GROUP: Record<PropPath, PropGroup> = {
  x: 'geom',
  y: 'geom',
  w: 'geom',
  h: 'geom',
  // Rotation is geometry: a hand dragging a block and a voice turning it are
  // both moving the same box, so they have to contend for the same lock.
  rotation: 'geom',
  color: 'style',
  fontSize: 'style',
  align: 'style',
  src: 'content',
  text: 'content',
  bold: 'style',
  italic: 'style',
  underline: 'style',
}

export function lockKey(blockId: string, group: PropGroup): string {
  return `${blockId}:${group}`
}

/** The key a command contends for, or null when it contends for nothing. */
export function keyFor(cmd: Command): string | null {
  if (cmd.op === 'set' || cmd.op === 'nudge') return lockKey(cmd.id, GROUP[cmd.path])
  return null
}

interface Lease {
  readonly txn: string
  expiresAt: number
}

export class LockTable {
  private readonly leases = new Map<string, Lease>()
  private readonly ttl: number
  private readonly clock: () => number

  constructor(clock: () => number = () => Date.now(), ttl: number = LOCK_TTL_MS) {
    this.clock = clock
    this.ttl = ttl
  }

  /** The transaction holding `key`, ignoring leases that have already expired. */
  holder(key: string): string | undefined {
    const lease = this.leases.get(key)
    if (lease === undefined) return undefined
    if (lease.expiresAt <= this.clock()) {
      this.leases.delete(key)
      return undefined
    }
    return lease.txn
  }

  /** Takes or renews the lease. Returns false when another transaction holds it. */
  acquire(key: string, txn: string): boolean {
    const current = this.holder(key)
    if (current !== undefined && current !== txn) return false
    this.leases.set(key, { txn, expiresAt: this.clock() + this.ttl })
    return true
  }

  /** Drops every lease held by a transaction and reports the freed keys. */
  release(txn: string): string[] {
    const freed: string[] = []
    for (const [key, lease] of this.leases) {
      if (lease.txn === txn) {
        this.leases.delete(key)
        freed.push(key)
      }
    }
    return freed
  }

  /** Drops leases whose expiry has passed and reports the freed keys. */
  sweep(): string[] {
    const now = this.clock()
    const freed: string[] = []
    for (const [key, lease] of this.leases) {
      if (lease.expiresAt <= now) {
        this.leases.delete(key)
        freed.push(key)
      }
    }
    return freed
  }

  /** Keys currently leased, ignoring expired leases. */
  held(): string[] {
    const keys: string[] = []
    for (const key of [...this.leases.keys()]) {
      if (this.holder(key) !== undefined) keys.push(key)
    }
    return keys
  }

  /** When the earliest lease expires, or null when nothing is held. */
  nextExpiry(): number | null {
    let earliest: number | null = null
    for (const lease of this.leases.values()) {
      if (earliest === null || lease.expiresAt < earliest) earliest = lease.expiresAt
    }
    return earliest
  }
}
