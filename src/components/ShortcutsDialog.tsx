import { setUi, useUi } from '#/lib/ui'
import { DESKTOP_HOTKEY, isDesktop } from '#/lib/desktop'
import { Dialog } from './ui/dialog'

export const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const modKey = () => (isMac() ? '⌘' : 'Ctrl')

type Group = { title: string; items: [keys: string, what: string][] }

function groups(): Group[] {
  const mod = modKey()
  const alt = isMac() ? '⌥' : 'Alt'
  return [
    {
      title: 'Anywhere',
      items: [
        [`${mod} K`, 'Search pages and commands'],
        [`${mod} J`, 'Ask my notes'],
        [`${mod} Shift E`, 'Quick capture'],
        [`${mod} \\`, 'Show or hide the sidebar'],
        [`${mod} Z`, 'Undo (text, titles, pages, database cells)'],
        [`${mod} Y  or  ${mod} Shift Z`, 'Redo'],
        [`${mod} +  /  ${mod} −`, 'Bigger / smaller text'],
        [`${mod} 0`, 'Default text size'],
        [`${mod} /`, 'This list'],
        ...(isDesktop() ? ([[DESKTOP_HOTKEY, 'Quick capture from any app (desktop app)']] as [string, string][]) : []),
      ],
    },
    {
      title: 'Writing',
      items: [
        ['/', 'Insert a block: heading, to-do, table, toggle…'],
        ['[[', 'Link to a page'],
        ['@', 'Insert a date (@today, @tomorrow)'],
        ['[]  then space', 'Start a to-do list'],
        ['#  ##  ###  then space', 'Headings'],
        ['Tab  /  Shift Tab', 'Indent / outdent (Tab accepts an AI suggestion when one shows)'],
        [`${alt} ↑  /  ${alt} ↓`, 'Move the task or block up / down (also into the next section)'],
        [`${mod} Shift ↑  /  ↓`, 'Same as above'],
        [`${mod} B  ${mod} I  ${mod} U`, 'Bold, italic, underline'],
        [`${mod} →  /  ←`, 'Jump a word'],
        ['Esc', 'Dismiss an AI suggestion'],
      ],
    },
    {
      title: 'TODO lists',
      items: [
        ['Tab  on an empty task', "Add the next of today's suggested tasks"],
        ['⋯  on a task', 'Move to today, a section, Someday; snooze; drop; focus on it'],
      ],
    },
  ]
}

/** Every keyboard shortcut in one place (Ctrl/⌘ + /). */
export function ShortcutsDialog() {
  const open = useUi((s) => s.shortcutsOpen)
  return (
    <Dialog open={open} onOpenChange={(o) => setUi({ shortcutsOpen: o })} title="Keyboard shortcuts">
      <div className="max-h-[64vh] space-y-5 overflow-y-auto px-5 pb-5 pt-1">
        {groups().map((g) => (
          <section key={g.title}>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">{g.title}</h3>
            <dl className="divide-y divide-line text-sm">
              {g.items.map(([keys, what]) => (
                <div key={keys + what} className="flex items-baseline justify-between gap-4 py-1.5">
                  <dt className="text-muted">{what}</dt>
                  <dd className="flex-none">
                    <kbd className="whitespace-pre rounded border border-line bg-subtle px-1.5 py-0.5 font-sans text-xs">{keys}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
