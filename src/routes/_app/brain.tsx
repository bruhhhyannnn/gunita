import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/brain')({ component: () => <div className="p-10 text-muted">Brain coming soon.</div> })
