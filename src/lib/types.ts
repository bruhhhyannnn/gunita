export type PageKind = 'page' | 'todo' | 'database' | 'row' | 'meeting'

export interface Cover {
  kind: 'image' | 'gradient'
  value: string
  /** Vertical focus of the image, 0–100. */
  y?: number
  credit?: string
}

// ---------- Databases ----------

export type PropType = 'title' | 'text' | 'number' | 'select' | 'multiSelect' | 'status' | 'date' | 'checkbox' | 'url'

export interface SelectOption {
  id: string
  name: string
  color: OptionColor
}

export type OptionColor = 'gray' | 'brown' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'red'

export interface PropDef {
  id: string
  name: string
  type: PropType
  options?: SelectOption[]
}

export type ViewType = 'table' | 'board' | 'calendar' | 'list'

export interface ViewDef {
  id: string
  name: string
  type: ViewType
  /** Board: group by this select/status prop. Calendar: place by this date prop. */
  groupBy?: string
  dateProp?: string
  sort?: { prop: string; dir: 'asc' | 'desc' }[]
  filter?: { prop: string; op: 'is' | 'isNot' | 'contains' | 'empty' | 'notEmpty' | 'checked' | 'unchecked'; value?: string }[]
  hidden?: string[]
  widths?: Record<string, number>
}

export interface DatabaseSchema {
  props: PropDef[]
  views: ViewDef[]
}

// ---------- TODO lists ----------

export type Recurrence =
  | { kind: 'daily' }
  | { kind: 'weekdays'; days: number[] } // 0 = Sunday
  | { kind: 'monthly'; day: number }

export interface TemplateItem {
  id: string
  text: string
  repeat: Recurrence
  children?: TemplateItem[]
  /** Which section of the day it goes in (top-level items only). */
  section?: string
}

/** A group inside each TODO day, like "💼 Work" or "🏠 Personal". */
export interface TodoSectionDef {
  id: string
  name: string
  icon: string
  /** Only tasks in these sections go into the accomplishment report. */
  report: boolean
}

// ---------- Accomplishment reports ----------

export type ReportGrouping = 'ai' | 'parent' | 'day'

export interface ReportSettings {
  /** Draft a report automatically on the 15th and on the last day of each month. */
  auto: boolean
  heading: string
  /** Intro paragraph; {period} and {absences} are filled in. */
  intro: string
  /** Leave out tasks that came from the daily template (check emails, …). */
  skipRoutine: boolean
  grouping: ReportGrouping
  /** Start date of the last period that was drafted automatically. */
  lastAuto?: string
}

export interface ReportFor {
  listId: string
  from: string
  to: string
}

// ---------- Meetings ----------

export interface MeetingInfo {
  start?: string // ISO datetime
  end?: string
  attendees?: string[]
  location?: string
  eventId?: string
  eventLink?: string
  finishedAt?: number
  templated?: boolean
}

// ---------- Pages ----------

export interface PageMeta {
  id: string
  kind: PageKind
  title: string
  icon?: string
  cover?: Cover
  parentId: string | null
  order: string
  createdAt: number
  updatedAt: number
  favorite?: boolean
  hiddenFromAI?: boolean
  trashedAt?: number | null
  shareSlug?: string | null
  fullWidth?: boolean
  /** Database row property values keyed by PropDef id. */
  props: Record<string, unknown>
  /** For kind === 'database'. */
  db?: DatabaseSchema
  /** For kind === 'todo'. */
  template?: TemplateItem[]
  autoStart?: boolean
  /** For TODO lists: the sections each day is split into. */
  sections?: TodoSectionDef[]
  /** For kind === 'meeting'. */
  meeting?: MeetingInfo
  /** For TODO lists: accomplishment report settings. */
  report?: ReportSettings
  /** For generated report pages: which list and period they cover. */
  reportFor?: ReportFor
}

// ---------- AI memory & graph ----------

export interface InboxItem {
  id: string
  text: string
  /** Page the task came from, e.g. a meeting. */
  sourceId?: string
  /** Which TODO list should receive it. Empty = first list. */
  listId?: string
  createdAt: number
}

export interface MemoryFact {
  id: string
  text: string
  sourceIds: string[]
  createdAt: number
  updatedAt: number
  pinned?: boolean
  /** 'ai' facts can be edited; 'user' facts were written by you. */
  origin: 'ai' | 'user'
}

export type EntityType = 'project' | 'person' | 'topic' | 'course' | 'meeting' | 'org'

export interface Entity {
  id: string
  name: string
  type: EntityType
  summary?: string
  pageIds: string[]
  createdAt: number
  firstSeen: string // YYYY-MM-DD
}

export interface GraphLink {
  id: string
  source: string // page id or entity id
  target: string
  label?: string
  origin: 'ai' | 'user'
  confirmed: boolean
  createdAt: number
}

// ---------- Focus timer (Pomodoro) ----------

export type FocusSound = 'chime' | 'bell' | 'digital' | 'none'

export interface FocusConfig {
  /** Minutes of focus per set. */
  focus: number
  /** Minutes of break between sets (0: no breaks). */
  short: number
  sets: number
  longOn: boolean
  /** A long break after every N sets. */
  longEvery: number
  long: number
  /** Start breaks and the next set without waiting for a click. */
  auto: boolean
  sound: FocusSound
}

export interface FocusSettings extends FocusConfig {
  /** Daily goal, in minutes of focus. */
  goal: number
}

/** One finished (or stopped) focus period. */
export interface FocusEntry {
  id: string
  /** When it started (ms). */
  start: number
  day: string
  minutes: number
  task?: string
  taskId?: string
  listId?: string
}

export interface Settings {
  theme?: 'system' | 'light' | 'dark'
  ghostText?: boolean
  ghostTextInTodo?: boolean
  completionModel?: 'claude-opus-5-5' | 'claude-haiku-5-5' | 'workers-ai'
  workersAiModel?: string
  lastReflectAt?: number
  focus?: FocusSettings
}
