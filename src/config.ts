/**
 * App-wide switches.
 *
 * errorPage: 'developer' shows the full error, stack trace and a "copy details"
 * button. 'production' shows a friendly page instead. Flip it when Gunita is
 * ready for other people, either here or with VITE_ERROR_PAGE=production at build time.
 */
export const config = {
  errorPage: ((import.meta.env.VITE_ERROR_PAGE as string | undefined) ?? 'developer') as 'developer' | 'production',
}
