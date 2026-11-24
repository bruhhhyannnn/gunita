import { DropdownMenu } from 'radix-ui'
import { CalendarClock, Moon, RotateCcw, Sun, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { editors } from '#/editor/PageEditor'
import { addDays, isoDate } from '#/lib/dates'
import { TASK_MENU_EVENT, type TaskMenuEvent } from '#/todo/plugin'
import { dropTask, moveTaskToDay, restoreTask, snoozeTask, SOMEDAY } from '#/todo/logic'
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
              {(status === 'dropped' || status === 'snoozed') && (
                <MenuItem icon={<RotateCcw />} onSelect={() => run(() => restoreTask(editor!, ev.pos))}>
                  {status === 'dropped' ? 'Restore task' : 'Un-snooze'}
                </MenuItem>
              )}
              {ev.day !== today && !ev.attrs.checked && (
                <MenuItem icon={<Sun />} onSelect={() => run(() => moveTaskToDay(editor!, ev.pos, today))}>
                  Move to today
                </MenuItem>
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
