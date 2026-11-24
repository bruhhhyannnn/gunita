import * as Y from 'yjs'
import { editors } from '#/editor/PageEditor'
import { getApp } from './app'

/**
 * Checks off a task by its id, in the list's newest day that has it open.
 * Uses the open editor if the list is on screen, else edits the saved page.
 */
export async function completeTask(listId: string, taskId: string): Promise<boolean> {
  const editor = editors.get(listId)
  if (editor) {
    let pos = -1
    editor.state.doc.descendants((node, p) => {
      if (pos >= 0) return false
      if (node.type.name === 'taskItem' && node.attrs.taskId === taskId && !node.attrs.checked && !node.attrs.status) pos = p
      return true
    })
    if (pos < 0) return false
    const node = editor.state.doc.nodeAt(pos)!
    editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: true }))
    return true
  }
  return getApp().docs.withDoc(listId, (doc) => {
    const find = (el: Y.XmlElement | Y.XmlFragment): Y.XmlElement | null => {
      for (const c of el.toArray()) {
        if (!(c instanceof Y.XmlElement)) continue
        const checked = c.getAttribute('checked') as unknown
        if (c.nodeName === 'taskItem' && c.getAttribute('taskId') === taskId && checked !== true && checked !== 'true' && !c.getAttribute('status')) return c
        const inner = find(c)
        if (inner) return inner
      }
      return null
    }
    const item = find(doc.getXmlFragment('default'))
    if (!item) return false
    doc.transact(() => item.setAttribute('checked', true as unknown as string))
    getApp().ws.touch(listId)
    return true
  })
}
