import { TaskItem } from '@tiptap/extension-list'

/**
 * Task items carry extra attributes used by TODO lists:
 * - taskId: stable id that survives carry-over, so we can count how long a task has waited
 * - since: the day the task first appeared (YYYY-MM-DD)
 * - carry: how many times it has been carried to a new day
 * - status: 'moved' (carried to `movedTo`), 'dropped', 'snoozed' (until `snoozeUntil`), 'someday'
 * - templateId: set when the task came from the list's daily template
 * - source: where it came from, e.g. a meeting page id
 */
export const GunitaTaskItem = TaskItem.extend({
  addAttributes() {
    const attr = (name: string, parse?: (v: string | null) => unknown) => ({
      default: null,
      parseHTML: (el: HTMLElement) => (parse ? parse(el.getAttribute(`data-${name}`)) : el.getAttribute(`data-${name}`)),
      renderHTML: (attrs: Record<string, unknown>) => (attrs[name] == null ? {} : { [`data-${name}`]: String(attrs[name]) }),
    })
    return {
      ...this.parent?.(),
      taskId: attr('task-id'),
      since: attr('since'),
      carry: attr('carry', (v) => (v ? Number(v) : null)),
      status: attr('status'),
      movedTo: attr('moved-to'),
      snoozeUntil: attr('snooze-until'),
      templateId: attr('template-id'),
      source: attr('source'),
    }
  },
}).configure({ nested: true })
