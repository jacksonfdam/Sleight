import { getChildren } from '../core/document'
import type { Block, DocumentState } from '../core/types'

/**
 * Styles for the exported page. They are deliberately a separate, smaller set
 * from the editor's: the export carries no selection, hover, handle, or overlay
 * rules, because none of those concepts survive the serialisation.
 */
const PAGE_CSS = `*{box-sizing:border-box}
body{margin:0;background:#fff;color:#16202a;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.page{position:relative;margin:0 auto;overflow:hidden}
.block{position:absolute;display:grid;align-content:center;padding:12px;border-radius:8px;line-height:1.3}
.block.section{align-content:start;background:#f8fafb;border:1px solid #ccd5dd}
.block.hero{background:#eceff2;border-radius:14px}
.block.image{padding:0;overflow:hidden;background:#eceff2;border:1px solid #ccd5dd}
.block>span{display:block;width:100%;white-space:pre-wrap;word-break:break-word}
.block>img{display:block;width:100%;height:100%;object-fit:cover}`

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ESCAPES[char] ?? char)
}

function styleFor(block: Block): string {
  const { props } = block
  return [
    `left:${String(props.x)}px`,
    `top:${String(props.y)}px`,
    `width:${String(props.w)}px`,
    `height:${String(props.h)}px`,
    `color:${props.color}`,
    `font-size:${String(props.fontSize)}px`,
    `text-align:${props.align}`,
  ].join(';')
}

function renderBlock(doc: DocumentState, id: string, depth: number): string {
  const block = doc.blocks[id]
  if (block === undefined) return ''

  const indent = '  '.repeat(depth)
  const children = getChildren(doc, id)
    .map(childId => renderBlock(doc, childId, depth + 1))
    .join('\n')

  const inner =
    block.type === 'image'
      ? block.props.src.length > 0
        ? `<img src="${escapeHtml(block.props.src)}" alt="${escapeHtml(block.label)}">`
        : ''
      : block.props.text.length > 0
        ? `<span>${escapeHtml(block.props.text)}</span>`
        : ''

  const body = [inner, children].filter(part => part.length > 0).join('\n')
  const open = `${indent}<div class="block ${block.type}" style="${styleFor(block)}">`
  return body.length > 0 ? `${open}\n${body}\n${indent}</div>` : `${open}</div>`
}

/**
 * Serialises the document, not the DOM. Because the editor's overlay lives on a
 * separate canvas and its selection outlines are pseudo-elements, there is
 * nothing to strip: the exported markup carries no editor attributes because it
 * was never built from the editor's elements.
 */
export function exportHtml(doc: DocumentState, title = 'Sleight export'): string {
  const root = doc.blocks[doc.rootId]
  const width = root?.props.w ?? 960
  const height = root?.props.h ?? 640

  const body = getChildren(doc, doc.rootId)
    .map(id => renderBlock(doc, id, 2))
    .join('\n')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
${PAGE_CSS}
    </style>
  </head>
  <body>
    <div class="page" style="width:${String(width)}px;height:${String(height)}px">
${body}
    </div>
  </body>
</html>
`
}
