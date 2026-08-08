import { describe, expect, it } from 'vitest'
import { HistoryLog } from '../src/core/history-log'
import { starterDocument } from '../src/core/document'
import type { Command, Intent } from '../src/core/types'
import { describeCommand } from '../src/ui/history'

const doc = starterDocument()

function log(): HistoryLog {
  return new HistoryLog({ describe: cmd => describeCommand(cmd, doc) })
}

function intent(cmd: Command, txn?: string, ts = 0): Intent {
  return txn === undefined ? { cmd, source: 'voice', ts } : { cmd, source: 'hand', txn, ts }
}

describe('recording commands', () => {
  it('keeps one entry per command', () => {
    const entries = log()
    entries.record(intent({ op: 'select', id: 'hero' }))
    entries.record(intent({ op: 'set', id: 'hero', path: 'w', value: 500 }))
    expect(entries.all).toHaveLength(2)
  })

  it('never records a hover', () => {
    const entries = log()
    entries.record(intent({ op: 'hover', id: 'hero' }))
    expect(entries.all).toHaveLength(0)
  })

  it('collapses a gesture into one line with a count', () => {
    const entries = log()
    for (let i = 0; i < 30; i += 1) {
      entries.record(intent({ op: 'set', id: 'hero', path: 'x', value: i }, 'drag-1', i))
    }
    expect(entries.all).toHaveLength(1)
    expect(entries.all[0]?.count).toBe(30)
    // The line shows where the gesture ended, not where it started.
    expect(entries.all[0]?.text).toContain('29')
  })

  it('starts a new line for a different transaction', () => {
    const entries = log()
    entries.record(intent({ op: 'set', id: 'hero', path: 'x', value: 1 }, 'drag-1'))
    entries.record(intent({ op: 'set', id: 'hero', path: 'x', value: 2 }, 'drag-2'))
    expect(entries.all).toHaveLength(2)
  })

  it('does not collapse two different ops sharing a transaction', () => {
    const entries = log()
    entries.record(intent({ op: 'set', id: 'hero', path: 'x', value: 1 }, 'g'))
    entries.record(intent({ op: 'nudge', id: 'hero', path: 'x', delta: 4 }, 'g'))
    expect(entries.all).toHaveLength(2)
  })

  it('keeps the source each command came from', () => {
    const entries = log()
    entries.record(intent({ op: 'undo' }))
    entries.record(intent({ op: 'set', id: 'hero', path: 'x', value: 1 }, 'g'))
    expect(entries.all.map(e => e.source)).toEqual(['voice', 'hand'])
  })

  it('records an utterance that produced no command', () => {
    const entries = log()
    entries.recordUnheard('what is the weather like', 5)
    expect(entries.all[0]?.unheard).toBe('what is the weather like')
    expect(entries.all[0]?.source).toBe('voice')
  })

  it('empties on clear', () => {
    const entries = log()
    entries.record(intent({ op: 'undo' }))
    entries.clear()
    expect(entries.all).toHaveLength(0)
  })

  it('tells its listeners on every change', () => {
    const entries = log()
    let seen = 0
    entries.subscribe(all => {
      seen = all.length
    })
    entries.record(intent({ op: 'undo' }))
    expect(seen).toBe(1)
  })

  it('drops the oldest entries rather than growing without bound', () => {
    const entries = log()
    for (let i = 0; i < 260; i += 1) entries.record(intent({ op: 'undo' }, undefined, i))
    expect(entries.all.length).toBeLessThanOrEqual(200)
    // The newest survived; the oldest did not.
    expect(entries.all[entries.all.length - 1]?.ts).toBe(259)
  })
})

describe('describing a command', () => {
  it('names the block rather than its id', () => {
    expect(describeCommand({ op: 'set', id: 'hero', path: 'w', value: 500 }, doc)).toBe(
      'Hero · width 500',
    )
  })

  it('reads a flag as on or off', () => {
    expect(describeCommand({ op: 'set', id: 'intro', path: 'bold', value: true }, doc)).toBe(
      'Intro copy · bold on',
    )
  })

  it('signs a relative change', () => {
    expect(describeCommand({ op: 'nudge', id: 'hero', path: 'w', delta: 40 }, doc)).toBe(
      'Hero · width +40',
    )
    expect(describeCommand({ op: 'nudge', id: 'hero', path: 'w', delta: -40 }, doc)).toBe(
      'Hero · width -40',
    )
  })

  it('cuts a value too long to read', () => {
    const long = `https://example.test/${'a'.repeat(80)}.gif`
    const text = describeCommand({ op: 'set', id: 'shot', path: 'src', value: long }, doc)
    expect(text.length).toBeLessThan(50)
    expect(text.endsWith('…')).toBe(true)
  })

  it('describes the commands that touch no property', () => {
    expect(describeCommand({ op: 'undo' }, doc)).toBe('Undo')
    expect(describeCommand({ op: 'select', id: null }, doc)).toBe('Deselected')
    expect(describeCommand({ op: 'remove', id: 'shot' }, doc)).toBe('Deleted Image')
    expect(describeCommand({ op: 'noop' }, doc)).toBe('Not understood')
  })
})
