import type { AnyExtension } from '@tiptap/core'
import type * as Y from 'yjs'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import { TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Image from '@tiptap/extension-image'
import Highlight from '@tiptap/extension-highlight'
import Typography from '@tiptap/extension-typography'
import { common, createLowlight } from 'lowlight'
import { Callout, DateChip, PageEmbed, PageLink } from './nodes'
import { DatabaseEmbed } from './databaseEmbed'
import { GunitaTaskItem } from './taskItem'
import { Mentions, SlashCommands, type EditorContext } from './commands'
import { ImageUploads } from './uploads'
import { TodoDay } from '#/todo/todoDay'
import { TodoSection } from '#/todo/todoSection'
import { MoveBlock } from './moveBlock'
import { WordNav } from './wordNav'

const lowlight = createLowlight(common)

export function buildExtensions(opts: { doc: Y.Doc; ctx: EditorContext; extra?: AnyExtension[] }): AnyExtension[] {
  return [
    StarterKit.configure({
      undoRedo: false,
      codeBlock: false,
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: true, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } },
      dropcursor: { width: 2, color: 'var(--accent)' },
    }),
    Collaboration.configure({ document: opts.doc, field: 'default' }),
    Placeholder.configure({
      placeholder: ({ node }) => {
        if (node.type.name === 'heading') return `Heading ${node.attrs.level}`
        return "Write, press '/' for commands, '[[' to link a page"
      },
    }),
    TaskList,
    GunitaTaskItem,
    Details.configure({ persist: true }),
    DetailsSummary,
    DetailsContent,
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: 'plaintext' }),
    Image,
    Highlight,
    Typography,
    Callout,
    DateChip,
    PageLink,
    PageEmbed,
    DatabaseEmbed,
    TodoDay,
    TodoSection.configure({ pageId: opts.ctx.pageId }),
    SlashCommands.configure({ ctx: opts.ctx }),
    Mentions.configure({ ctx: opts.ctx }),
    ImageUploads,
    MoveBlock,
    WordNav,
    ...(opts.extra ?? []),
  ]
}
