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
    // keepOnSplit: false, so pressing Enter on a task starts a brand-new task
    // instead of cloning the previous one's id, age and template link.
    const attr = (key: string, dataName: string, parse?: (v: string | null) => unknown) => ({
      default: null,
      keepOnSplit: false,
      parseHTML: (el: HTMLElement) => (parse ? parse(el.getAttribute(`data-${dataName}`)) : el.getAttribute(`data-${dataName}`)),
      renderHTML: (attrs: Record<string, unknown>) => (attrs[key] == null ? {} : { [`data-${dataName}`]: String(attrs[key]) }),
    })
    return {
      ...this.parent?.(),
      taskId: attr('taskId', 'task-id'),
      since: attr('since', 'since'),
      carry: attr('carry', 'carry', (v) => (v ? Number(v) : null)),
      status: attr('status', 'status'),
      movedTo: attr('movedTo', 'moved-to'),
      snoozeUntil: attr('snoozeUntil', 'snooze-until'),
      templateId: attr('templateId', 'template-id'),
      source: attr('source', 'source'),
    }
  },
}).configure({ nested: true })
