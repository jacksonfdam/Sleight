import { emptyDocument } from './document'
import { reduce } from './reducer'
import type { Command, DocCommand, DocumentState, ShellCommand } from './types'

/** Older transactions are folded into the base document once this many are kept. */
const HISTORY_LIMIT = 240

export interface EditorState {
  readonly doc: DocumentState
  readonly selectedId: string | null
  readonly hoveredId: string | null
  readonly canUndo: boolean
  readonly canRedo: boolean
}

interface Transaction {
  readonly key: string
  readonly startedAt: number
  readonly cmds: DocCommand[]
}

function isShell(cmd: Command): cmd is ShellCommand {
  return cmd.op === 'select' || cmd.op === 'hover' || cmd.op === 'undo' || cmd.op === 'redo'
}

function replay(base: DocumentState, txns: readonly Transaction[]): DocumentState {
  let doc = base
  for (const txn of txns) {
    for (const cmd of txn.cmds) doc = reduce(doc, cmd)
  }
  return doc
}

/**
 * History is kept as a list of transactions rather than a list of document
 * snapshots. Undo drops the most recent transaction and replays the rest, which
 * stays correct when a voice command lands in the middle of an open gesture:
 * the lock table guarantees the two transactions touch disjoint property groups,
 * so their commands commute and replay order does not matter.
 */
export class Store {
  private base: DocumentState
  private doc: DocumentState
  private past: Transaction[] = []
  private future: Transaction[] = []
  private selectedId: string | null = null
  private hoveredId: string | null = null
  private autoKey = 0
  private snapshot: EditorState
  private readonly listeners = new Set<(state: EditorState) => void>()

  constructor(initial: DocumentState = emptyDocument()) {
    this.base = initial
    this.doc = initial
    this.snapshot = this.build()
  }

  getState(): EditorState {
    return this.snapshot
  }

  subscribe(listener: (state: EditorState) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  apply(cmd: Command, txn?: string, ts = 0): void {
    if (isShell(cmd)) {
      this.applyShell(cmd)
      return
    }
    this.applyDoc(cmd, txn, ts)
  }

  undo(): void {
    const txn = this.past.pop()
    if (txn === undefined) return
    this.future.push(txn)
    this.doc = replay(this.base, this.past)
    this.reconcileSelection()
    this.emit()
  }

  redo(): void {
    const txn = this.future.pop()
    if (txn === undefined) return
    this.past.push(txn)
    for (const cmd of txn.cmds) this.doc = reduce(this.doc, cmd)
    this.reconcileSelection()
    this.emit()
  }

  private applyShell(cmd: ShellCommand): void {
    switch (cmd.op) {
      case 'select':
        if (this.selectedId === cmd.id) return
        this.selectedId = cmd.id
        break
      case 'hover':
        if (this.hoveredId === cmd.id) return
        this.hoveredId = cmd.id
        break
      case 'undo':
        this.undo()
        return
      case 'redo':
        this.redo()
        return
    }
    this.emit()
  }

  private applyDoc(cmd: DocCommand, txn: string | undefined, ts: number): void {
    const next = reduce(this.doc, cmd)
    if (next === this.doc) return

    this.doc = next
    this.future.length = 0

    const key = txn ?? `auto:${String(this.autoKey++)}`
    const open = this.findOpen(key)
    if (open !== undefined) {
      open.cmds.push(cmd)
    } else {
      this.past.push({ key, startedAt: ts, cmds: [cmd] })
      this.trim()
    }

    this.reconcileSelection()
    this.emit()
  }

  /** Commands sharing a transaction key collapse into a single undo step. */
  private findOpen(key: string): Transaction | undefined {
    for (let i = this.past.length - 1; i >= 0; i -= 1) {
      const txn = this.past[i]
      if (txn !== undefined && txn.key === key) return txn
    }
    return undefined
  }

  private trim(): void {
    while (this.past.length > HISTORY_LIMIT) {
      const oldest = this.past.shift()
      if (oldest === undefined) return
      for (const cmd of oldest.cmds) this.base = reduce(this.base, cmd)
    }
  }

  private reconcileSelection(): void {
    if (this.selectedId !== null && this.doc.blocks[this.selectedId] === undefined) {
      this.selectedId = null
    }
    if (this.hoveredId !== null && this.doc.blocks[this.hoveredId] === undefined) {
      this.hoveredId = null
    }
  }

  private build(): EditorState {
    return {
      doc: this.doc,
      selectedId: this.selectedId,
      hoveredId: this.hoveredId,
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
    }
  }

  private emit(): void {
    this.snapshot = this.build()
    for (const listener of this.listeners) listener(this.snapshot)
  }
}
