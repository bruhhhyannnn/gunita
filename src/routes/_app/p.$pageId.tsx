import { createFileRoute } from '@tanstack/react-router'
import { PageView } from '#/components/PageView'

export const Route = createFileRoute('/_app/p/$pageId')({
  component: PageRoute,
  validateSearch: (s: Record<string, unknown>): { start?: 'today' } => (s.start === 'today' ? { start: 'today' } : {}),
})

function PageRoute() {
  const { pageId } = Route.useParams()
  return <PageView pageId={pageId} />
}
