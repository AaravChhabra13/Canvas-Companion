import { Notification, shell } from 'electron'
import type { Assignment, DailyDigest } from '../src/shared/types'

// Map of "assignmentId:leadMinutes" → pending setTimeout handle
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()

// Keys of (assignment, leadTime) pairs that have already fired, scoped to the
// current dueAt. Persisted to disk via the setter below so dedup survives restarts.
// Key format: `${assignmentId}:${leadMinutes}:${dueAtIso}` so re-scheduled assignments
// (e.g. instructor changes due date) get a fresh slot.
let firedKeys = new Set<string>()
let firedKeysPersist: ((keys: Set<string>) => void) | null = null

export function initFiredKeys(initial: Set<string>, persist: (keys: Set<string>) => void): void {
  firedKeys = initial
  firedKeysPersist = persist
}

function markFired(key: string): void {
  firedKeys.add(key)
  firedKeysPersist?.(firedKeys)
}

function clearAllTimers(): void {
  for (const t of pendingTimers.values()) clearTimeout(t)
  pendingTimers.clear()
}

export function rescheduleNotifications(
  assignments: Assignment[],
  leadTimes: number[],
  completedIds: Set<string> = new Set(),
): void {
  if (!Notification.isSupported()) return

  clearAllTimers()

  const now = Date.now()

  for (const a of assignments) {
    if (!a.dueAt) continue
    if (a.submissionState === 'submitted' || a.submissionState === 'graded') continue
    if (completedIds.has(a.id)) continue

    const dueMs = new Date(a.dueAt).getTime()

    for (const leadMinutes of leadTimes) {
      const fireAtMs = dueMs - leadMinutes * 60_000
      const key = `${a.id}:${leadMinutes}:${a.dueAt}`
      if (firedKeys.has(key)) continue

      const delayMs = fireAtMs - now

      const fire = () => {
        pendingTimers.delete(key)
        markFired(key)
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

      if (delayMs <= 0) {
        // Deadline passed (during sleep, or before scheduler ran). Fire immediately.
        // setImmediate avoids reentrancy with the for-loop.
        setImmediate(fire)
      } else {
        const timer = setTimeout(fire, delayMs)
        pendingTimers.set(key, timer)
      }
    }
  }
}

// Prune fired-keys that are >7 days past their dueAt. Called periodically by ipc.ts
// to keep the persisted set from growing unbounded across a semester.
export function pruneFiredKeys(olderThanMs: number = 7 * 24 * 60 * 60_000): void {
  const cutoff = Date.now() - olderThanMs
  let changed = false
  for (const key of firedKeys) {
    const parts = key.split(':')
    const dueAtIso = parts[parts.length - 1]
    const dueMs = new Date(dueAtIso).getTime()
    if (!isNaN(dueMs) && dueMs < cutoff) {
      firedKeys.delete(key)
      changed = true
    }
  }
  if (changed) firedKeysPersist?.(firedKeys)
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
