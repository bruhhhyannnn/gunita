import { DropdownMenu } from 'radix-ui'
import { CalendarClock, CornerDownRight, Moon, RotateCcw, Sun, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { editors } from '#/editor/PageEditor'
import { addDays, isoDate } from '#/lib/dates'
import { TASK_MENU_EVENT, type TaskMenuEvent } from '#/todo/plugin'
import { dropTask, moveTaskToDay, moveTaskToSection, restoreTask, sectionAt, snoozeTask, SOMEDAY } from '#/todo/logic'
import { useWs } from '#/lib/app'
import { MenuItem, MenuLabel, MenuSeparator } from '../ui/menu'
import { Calendar } from '../ui/date-picker'

function nextMonday() {
  const d = new Date()
  const add = ((8 - d.getDay()) % 7) || 7
  return addDays(isoDate(), add)
}

/** The "⋯" menu on each task: drop, snooze, someday, move to today. */
export function TaskMenu({ pageId }: { pageId: string }) {
  const [ev, setEv] = useState<TaskMenuEvent | null>(null)
  const [pick, setPick] = useState(false)
  const page = useWs((s) => s.pages[pageId])
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<TaskMenuEvent>).detail
      if (d.pageId === pageId) {
        setPick(false)
        setEv(d)
      }
    }
    window.addEventListener(TASK_MENU_EVENT, on)
    return () => window.removeEventListener(TASK_MENU_EVENT, on)
  }, [pageId])
  if (!ev) return null
  const editor = editors.get(pageId)
  const today = isoDate()
  const run = (fn: () => void) => {
    if (editor) fn()
    setEv(null)
  }
  const status = ev.attrs.status as string | null
  const current = editor ? sectionAt(editor.state.doc, ev.pos + 1) : null
  const sections = (page?.sections ?? []).filter((x) => x.id !== current)
  const topLevel = editor ? editor.state.doc.resolve(ev.pos).parent.type.name === 'taskList' && editor.state.doc.resolve(ev.pos).node(-1)?.type.name !== 'taskItem' : false
  return (
    <DropdownMenu.Root open onOpenChange={(o) => !o && setEv(null)}>
      <DropdownMenu.Trigger asChild>
        <span style={{ position: 'fixed', left: ev.rect.left, top: ev.rect.bottom, width: 1, height: 1 }} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={4} collisionPadding={8} className="animate-pop z-50 min-w-[220px] rounded-lg bg-popover p-1 text-[14px] shadow-pop outline-none">
          {pick ? (
            <Calendar min={addDays(today, 1)} onChange={(d) => run(() => snoozeTask(editor!, ev.pos, d))} />
          ) : (
            <>
              {(status === 'dropped' || status === 'snoozed' || status === 'archived') && (
                <MenuItem icon={<RotateCcw />} onSelect={() => run(() => restoreTask(editor!, ev.pos))}>
                  {status === 'snoozed' ? 'Un-snooze' : status === 'archived' ? 'Carry over again' : 'Restore task'}
                </MenuItem>
              )}
              {ev.day !== today && !ev.attrs.checked && (
                <MenuItem icon={<Sun />} onSelect={() => run(() => moveTaskToDay(editor!, ev.pos, today))}>
                  Move to today
                </MenuItem>
              )}
              {topLevel && status !== 'moved' && (sections.length > 0 || current) && (
                <>
                  <MenuLabel>Move to section</MenuLabel>
                  {sections.map((x) => (
                    <MenuItem key={x.id} icon={<span className="text-[14px] leading-none">{x.icon || <CornerDownRight />}</span>} onSelect={() => run(() => moveTaskToSection(editor!, ev.pos, x.id, page!))}>
                      {x.name}
                    </MenuItem>
                  ))}
                  {current && (
                    <MenuItem icon={<CornerDownRight />} onSelect={() => run(() => moveTaskToSection(editor!, ev.pos, null, page!))}>
                      No section
                    </MenuItem>
                  )}
                  <MenuSeparator />
                </>
              )}
              {!ev.attrs.checked && status !== 'dropped' && (
                <>
                  <MenuLabel>Snooze until</MenuLabel>
                  <MenuItem icon={<CalendarClock />} onSelect={() => run(() => snoozeTask(editor!, ev.pos, addDays(today, 1)))}>
                    Tomorrow
                  </MenuItem>
                  <MenuItem icon={<CalendarClock />} onSelect={() => run(() => snoozeTask(editor!, ev.pos, addDays(today, 3)))}>
                    In 3 days
                  </MenuItem>
                  <MenuItem icon={<CalendarClock />} onSelect={() => run(() => snoozeTask(editor!, ev.pos, nextMonday()))}>
                    Next Monday
                  </MenuItem>
                  <MenuItem
                    icon={<CalendarClock />}
                    onSelect={(e) => {
                      e.preventDefault()
                      setPick(true)
                    }}
                  >
                    Pick a date…
                  </MenuItem>
                  <MenuSeparator />
                  {ev.day !== SOMEDAY && (
                    <MenuItem icon={<Moon />} onSelect={() => run(() => moveTaskToDay(editor!, ev.pos, SOMEDAY))}>
                      Move to Someday
                    </MenuItem>
                  )}
                  <MenuItem icon={<XCircle />} danger onSelect={() => run(() => dropTask(editor!, ev.pos))}>
                    Drop (won't do)
                  </MenuItem>
                </>
              )}
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
