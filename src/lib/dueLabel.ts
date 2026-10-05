import { differenceInCalendarDays, formatDistanceStrict } from 'date-fns'

// Later calendar days count by date, not elapsed time, so 12:00 AM and
// 11:00 AM on the same day both read "in 3 days". Later today keeps hours/minutes.
export function formatDueLabel(due: Date, now: Date = new Date()): string {
  const days = differenceInCalendarDays(due, now)
  if (days === 1) return 'tomorrow'
  if (days > 1) return `in ${days} days`
  return formatDistanceStrict(due, now, { addSuffix: true })
}
