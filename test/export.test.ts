import { describe, expect, it } from 'vitest'
import { ROOT_ID, createBlock, starterDocument } from '../src/core/document'
import { reduce } from '../src/core/reducer'
import { exportHtml } from '../src/render/export'

describe('standalone export', () => {
  it('produces a complete document', () => {
    const html = exportHtml(starterDocument())
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('</html>')
  })

  it('carries no editor artifacts', () => {
    const html = exportHtml(starterDocument())
    expect(html).not.toContain('data-block-id')
    expect(html).not.toContain('data-block-type')
    expect(html).not.toContain('data-handle')
    expect(html).not.toContain('sl-')
    expect(html).not.toContain('is-selected')
    expect(html).not.toContain('canvas')
    expect(html).not.toContain('<script')
  })

  it('inlines its styles rather than linking them', () => {
    const html = exportHtml(starterDocument())
    expect(html).toContain('<style>')
    expect(html).not.toContain('<link')
  })

  it('writes block geometry and style', () => {
    const html = exportHtml(starterDocument())
    expect(html).toContain('left:48px')
    expect(html).toContain('font-size:44px')
    expect(html).toContain('text-align:center')
  })

  it('escapes text content', () => {
    const doc = reduce(starterDocument(), {
      op: 'set',
      id: 'intro',
      path: 'text',
      value: '<script>alert("x")</script>',
    })
    const html = exportHtml(doc)
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>alert')
  })

  it('omits an image element when there is no source', () => {
    expect(exportHtml(starterDocument())).not.toContain('<img')
  })

  it('emits an image element once a source is set', () => {
    const doc = reduce(starterDocument(), {
      op: 'set',
      id: 'shot',
      path: 'src',
      value: 'https://example.com/a.jpg',
    })
    expect(exportHtml(doc)).toContain('<img src="https://example.com/a.jpg"')
  })

  it('nests children inside their parent', () => {
    let doc = starterDocument()
    doc = reduce(doc, {
      op: 'insert',
      parent: ROOT_ID,
      index: 0,
      block: createBlock('wrap', 'section', 'Wrapper'),
    })
    doc = reduce(doc, { op: 'move', id: 'intro', parent: 'wrap', index: 0 })

    const html = exportHtml(doc)
    const wrapper = html.indexOf('class="block section"')
    const child = html.indexOf('Move a block')
    const close = html.indexOf('</div>', wrapper)
    expect(wrapper).toBeGreaterThan(-1)
    expect(child).toBeGreaterThan(wrapper)
    expect(child).toBeLessThan(close)
  })
})
