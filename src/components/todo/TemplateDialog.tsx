import { useRef } from 'react'
import { getApp } from '#/lib/app'
import type { PageMeta } from '#/lib/types'
import { Dialog } from '../ui/dialog'
import { Button } from '../ui/button'
import { CheckboxField } from '../ui/checkbox'
import { TemplateEditor, type TemplateEditorHandle } from './TemplateEditor'

/** Edits the tasks that Start Today adds (every day, on chosen weekdays, or monthly). */
export function TemplateDialog({ page, open, onOpenChange }: { page: PageMeta; open: boolean; onOpenChange: (o: boolean) => void }) {
  const editor = useRef<TemplateEditorHandle>(null)
  const save = () => {
    if (editor.current) getApp().ws.updatePage(page.id, { template: editor.current.getItems() })
    onOpenChange(false)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Daily template"
      description="Added each time you start a day. Type like a normal list: Enter for a new task, Tab / Shift+Tab to indent, drag the handle or press Ctrl+Shift+↑/↓ to reorder. Click a task's chip to choose which days it repeats."
    >
      <div className="max-h-[52vh] overflow-y-auto px-5 py-3">{open && <TemplateEditor ref={editor} initial={page.template ?? []} />}</div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
        <CheckboxField
          label="Start the day automatically when I open this list"
          checked={page.autoStart !== false}
          onCheckedChange={(v) => getApp().ws.updatePage(page.id, { autoStart: v })}
        />
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
