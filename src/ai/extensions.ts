import type { AnyExtension } from '@tiptap/core'
import type { PageMeta } from '#/lib/types'
import { GhostText } from './ghost'

export function aiExtensions(page: PageMeta): AnyExtension[] {
  return [GhostText.configure({ pageId: page.id, kind: page.kind })]
}
