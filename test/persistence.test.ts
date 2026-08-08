import { describe, expect, it } from 'vitest'
import { ROOT_ID, createBlock, starterDocument } from '../src/core/document'
import {
  deserializeDocument,
  loadDocument,
  saveDocument,
  serializeDocument,
} from '../src/core/persistence'
import { reduce } from '../src/core/reducer'

/** A localStorage stand-in, so the tests never touch a real one. */
class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>()

  get length(): number {
    return this.entries.size
  }
  clear(): void {
    this.entries.clear()
  }
  getItem(key: string): string | null {
    return this.entries.get(key) ?? null
  }
  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null
  }
  removeItem(key: string): void {
    this.entries.delete(key)
  }
  setItem(key: string, value: string): void {
    this.entries.set(key, value)
  }
}

/** A store that refuses every write, as a full or blocked one would. */
class HostileStorage extends MemoryStorage {
  override setItem(): void {
    throw new DOMException('quota exceeded')
  }
}

describe('round trip', () => {
  it('restores an equivalent document', () => {
    const doc = starterDocument()
    const restored = deserializeDocument(serializeDocument(doc))
    expect(restored).toEqual(doc)
  })

  it('restores nested blocks with their parents', () => {
    let doc = starterDocument()
    doc = reduce(doc, {
      op: 'insert',
      parent: ROOT_ID,
      index: 0,
      block: createBlock('wrap', 'section', 'Wrapper'),
    })
    doc = reduce(doc, { op: 'move', id: 'intro', parent: 'wrap', index: 0 })

    const restored = deserializeDocument(serializeDocument(doc))
    expect(restored?.parents['intro']).toBe('wrap')
    expect(restored?.children['wrap']).toEqual(['intro'])
  })

  it('survives a storage round trip', () => {
    const storage = new MemoryStorage()
    saveDocument(starterDocument(), storage)
    expect(loadDocument(storage)).toEqual(starterDocument())
  })

  it('reports nothing stored as null', () => {
    expect(loadDocument(new MemoryStorage())).toBeNull()
  })
})

describe('malformed input', () => {
  it('rejects invalid json', () => {
    expect(deserializeDocument('{ not json')).toBeNull()
  })

  it('rejects a payload with no root', () => {
    expect(deserializeDocument(JSON.stringify({ blocks: [], children: {} }))).toBeNull()
  })

  it('rejects a root that is missing from the block list', () => {
    expect(deserializeDocument(JSON.stringify({ rootId: 'root', blocks: [] }))).toBeNull()
  })

  it('drops a block with an unknown type', () => {
    const raw = JSON.stringify({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'section', label: 'Canvas', props: {} },
        { id: 'weird', type: 'carousel', label: 'Weird', props: {} },
      ],
      children: { root: ['weird'] },
    })
    const restored = deserializeDocument(raw)
    expect(restored?.blocks['weird']).toBeUndefined()
    expect(restored?.children['root']).toEqual([])
  })

  it('drops a block that no parent claims', () => {
    const raw = JSON.stringify({
      rootId: 'root',
      blocks: [
        { id: 'root', type: 'section', label: 'Canvas', props: {} },
        { id: 'orphan', type: 'text', label: 'Orphan', props: {} },
      ],
      children: { root: [] },
    })
    expect(deserializeDocument(raw)?.blocks['orphan']).toBeUndefined()
  })

  it('fills in missing properties with defaults', () => {
    const raw = JSON.stringify({
      rootId: 'root',
      blocks: [{ id: 'root', type: 'section', label: 'Canvas', props: { x: 'nope' } }],
      children: { root: [] },
    })
    expect(deserializeDocument(raw)?.blocks['root']?.props.x).toBe(0)
  })
})

describe('storage failure', () => {
  it('does not throw when the store refuses a write', () => {
    expect(() => {
      saveDocument(starterDocument(), new HostileStorage())
    }).not.toThrow()
  })
})
