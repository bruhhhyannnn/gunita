import { Node } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react'
import { DatabaseView } from '#/components/database/DatabaseView'
import { usePage } from '#/lib/app'

function DatabaseEmbedView({ node }: ReactNodeViewProps) {
  const page = usePage(node.attrs.id as string)
  return (
    <NodeViewWrapper className="my-3" data-drag-handle>
      <div contentEditable={false}>
        {page && !page.trashedAt ? (
          <DatabaseView page={page} inline />
        ) : (
          <div className="rounded-md border border-line px-3 py-2 text-sm text-faint">This database was deleted.</div>
        )}
      </div>
    </NodeViewWrapper>
  )
}

export const DatabaseEmbed = Node.create({
  name: 'databaseEmbed',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return { id: { default: null } }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="database-embed"]', getAttrs: (el) => ({ id: (el as HTMLElement).getAttribute('data-id') }) }]
  },
  renderHTML({ node }) {
    return ['div', { 'data-type': 'database-embed', 'data-id': node.attrs.id }]
  },
  addNodeView() {
    return ReactNodeViewRenderer(DatabaseEmbedView)
  },
})
