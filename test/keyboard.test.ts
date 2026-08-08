// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { KeyboardAdapter } from '../src/adapters/keyboard'
import { IntentBus } from '../src/core/bus'
import type { Intent } from '../src/core/types'

describe('keyboard deletion', () => {
  let bus: IntentBus
  let seen: Intent[]
  let selected: string | null
  let adapter: KeyboardAdapter

  beforeEach(() => {
    document.body.replaceChildren()
    bus = new IntentBus()
    seen = []
    selected = 'hero'
    bus.subscribe(intent => seen.push(intent))
    adapter = new KeyboardAdapter({ bus, getSelected: () => selected })
    adapter.attach()
  })

  // The listener lives on the shared document, so it outlives the test that
  // added it unless it is taken off again.
  afterEach(() => {
    adapter.detach()
  })

  const press = (key: string, target?: HTMLElement): boolean => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    ;(target ?? document.body).dispatchEvent(event)
    return event.defaultPrevented
  }

  it('deletes the selection on delete and on backspace', () => {
    press('Delete')
    press('Backspace')
    expect(seen).toHaveLength(2)
    expect(seen[0]?.cmd).toEqual({ op: 'remove', id: 'hero' })
  })

  it('stops the browser acting on the key it used', () => {
    expect(press('Delete')).toBe(true)
  })

  it('ignores every other key', () => {
    press('a')
    press('Enter')
    press('Escape')
    expect(seen).toHaveLength(0)
  })

  it('does nothing with no selection', () => {
    selected = null
    expect(press('Delete')).toBe(false)
    expect(seen).toHaveLength(0)
  })

  // The case that would otherwise delete a block while someone edits a field.
  it('leaves a keystroke in a form control alone', () => {
    for (const tag of ['input', 'textarea', 'select'] as const) {
      const control = document.createElement(tag)
      document.body.append(control)
      press('Backspace', control)
    }
    expect(seen).toHaveLength(0)
  })

  it('leaves a keystroke in editable text alone', () => {
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    // happy-dom does not derive isContentEditable from the attribute.
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    document.body.append(editable)
    press('Backspace', editable)
    expect(seen).toHaveLength(0)
  })

  it('stops emitting once detached', () => {
    const extra = new KeyboardAdapter({ bus, getSelected: () => selected })
    extra.attach()
    extra.detach()
    press('Delete')
    // One intent, from the adapter that is still attached, not two.
    expect(seen).toHaveLength(1)
  })
})
