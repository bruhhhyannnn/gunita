import { getSchema, type JSONContent } from '@tiptap/core'
import type { Schema } from '@tiptap/pm/model'
import * as Y from 'yjs'
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap'
import { buildExtensions } from '#/editor/extensions'
import { getApp } from './app'

let schema: Schema | null = null

/** The page editor's schema, for building documents without an open editor. */
export function editorSchema(): Schema {
  if (!schema) schema = getSchema(buildExtensions({ doc: new Y.Doc(), ctx: { pageId: '' } }))
  return schema
}

/** Checks a document against the schema; throws with a readable message if invalid. */
export function validateDoc(json: JSONContent) {
  editorSchema().nodeFromJSON(json).check()
}

/** Replaces a page's body with the given editor JSON (works offline and syncs like any edit). */
export async function writePageDoc(pageId: string, json: JSONContent) {
  const s = editorSchema()
  await getApp().docs.withDoc(pageId, (doc) => {
    doc.transact(() => {
      prosemirrorJSONToYXmlFragment(s, json, doc.getXmlFragment('default'))
    })
  })
}
