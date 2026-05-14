import { Notification, shell } from 'electron'
import type { Assignment, DailyDigest } from '../src/shared/types'

// Tracks which (assignment, leadTime) pairs have already fired this session.
// This is in-memory only — resets on restart. That's intentional: the window
// between lastSyncAt and now acts as the durable dedup guard across restarts.
const fired = new Set<string>()

export function checkAndFireNotifications(
  assignments: Assignment[],
  leadTimes: number[],
  lastSyncAt: string | null,
  completedIds: Set<string> = new Set(),
): void {
  if (!Notification.isSupported()) return

  const now = new Date()
  const prevSync = lastSyncAt ? new Date(lastSyncAt) : new Date(0)

  for (const a of assignments) {
    if (!a.dueAt) continue
    if (a.submissionState === 'submitted' || a.submissionState === 'graded') continue
    if (completedIds.has(a.id)) continue

    const dueDate = new Date(a.dueAt)

    for (const leadMinutes of leadTimes) {
      const fireAt = new Date(dueDate.getTime() - leadMinutes * 60_000)
      const key = `${a.id}:${leadMinutes}:${new Date().toISOString().slice(0, 13)}`

      if (fired.has(key)) continue
      // Only fire if this window (prevSync, now] contains the fire time
      if (fireAt <= prevSync || fireAt > now) continue

      fired.add(key)

      const hours = leadMinutes / 60
      const timeLabel =
        leadMinutes % 60 === 0
          ? `${hours} hour${hours !== 1 ? 's' : ''}`
          : `${leadMinutes} minutes`

      const n = new Notification({
        title: a.courseName,
        body: `${a.title} — due in ${timeLabel}`,
        silent: false,
      })
      const url = a.canvasUrl
      if (url) n.on('click', () => shell.openExternal(url))
      n.show()
    }
  }
}

// Fires a silent test notification — causes macOS to prompt for permission on first run
export function requestNotificationPermission(): void {
  if (!Notification.isSupported()) return
  const n = new Notification({
    title: 'Canvas Dashboard',
    body: "You'll be notified before assignments are due.",
    silent: true,
  })
  n.show()
}

// ── Daily digest ──────────────────────────────────────────────────────────────

let digestTimer: ReturnType<typeof setTimeout> | null = null
let lastDigestDate: string | null = null
let digestAssignments: Assignment[] = []
let digestCompletedIds: Set<string> = new Set()

export function updateDigestAssignments(assignments: Assignment[], completedIds: Set<string> = new Set()): void {
  digestAssignments = assignments
  digestCompletedIds = completedIds
}

function msUntilNext(hour: number, minute: number): number {
  const now = new Date()
  const target = new Date()
  target.setHours(hour, minute, 0, 0)
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1)
  return target.getTime() - now.getTime()
}

export function scheduleDailyDigest(digest: DailyDigest | undefined): void {
  if (digestTimer !== null) {
    clearTimeout(digestTimer)
    digestTimer = null
  }
  if (!digest?.enabled) return

  const { hour, minute } = digest

  // If today's digest time has already passed, fire immediately
  const now = new Date()
  const todayTarget = new Date()
  todayTarget.setHours(hour, minute, 0, 0)
  if (todayTarget.getTime() <= now.getTime()) {
    fireDailyDigest(digestAssignments)
  }

  function scheduleNext() {
    digestTimer = setTimeout(() => {
      fireDailyDigest(digestAssignments)
      scheduleNext()
    }, msUntilNext(hour, minute))
  }

  scheduleNext()
}

function fireDailyDigest(assignments: Assignment[]): void {
  if (!Notification.isSupported()) return

  const todayStr = new Date().toISOString().slice(0, 10)
  if (lastDigestDate === todayStr) return

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd   = new Date(todayStart.getTime() + 86_400_000 - 1)
  const tmrwStart  = new Date(todayEnd.getTime() + 1)
  const tmrwEnd    = new Date(tmrwStart.getTime() + 86_400_000 - 1)

  const isDone = (a: Assignment): boolean =>
    a.submissionState === 'submitted' ||
    a.submissionState === 'graded' ||
    digestCompletedIds.has(a.id)

  const overdue = assignments.filter(a => {
    if (!a.isOverdue) return false
    if (isDone(a)) return false
    return true
  }).length

  const dueToday = assignments.filter(a => {
    if (!a.dueAt) return false
    if (isDone(a)) return false
    const t = new Date(a.dueAt).getTime()
    if (t < now.getTime()) return false
    return t >= todayStart.getTime() && t <= todayEnd.getTime()
  }).length

  const dueTomorrow = assignments.filter(a => {
    if (!a.dueAt) return false
    if (isDone(a)) return false
    const t = new Date(a.dueAt).getTime()
    return t >= tmrwStart.getTime() && t <= tmrwEnd.getTime()
  }).length

  if (overdue + dueToday + dueTomorrow === 0) return

  lastDigestDate = todayStr

  const parts: string[] = []
  if (dueToday > 0) parts.push(`${dueToday} due today`)
  if (dueTomorrow > 0) parts.push(`${dueTomorrow} due tomorrow`)
  if (overdue > 0) parts.push(`${overdue} overdue`)

  new Notification({ title: 'Canvas Companion', body: parts.join(' · '), silent: false }).show()
}
