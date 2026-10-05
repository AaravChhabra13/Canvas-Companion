import { createRequire } from 'node:module'
import axios from 'axios'
import type { Assignment, Course, CseSiteEntry } from '../src/shared/types'
import { getToken, fetchCoursesFromApi, fetchPlannerItems } from './canvasApi'
import { fetchAssignmentsViaGraphQL } from './graphqlApi'
import { scrapeCseSite, mergeCseAssignments } from './cseScraper'

// ical.js is CJS; use createRequire so Rollup passes it through at runtime
const _require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICAL = _require('ical.js') as any

export interface SyncResult {
  assignments: Assignment[]
  courses: Course[]
}

// Merge freshly fetched courses with stored ones, preserving user's color/hidden edits
function mergeCourses(fresh: Course[], stored: Course[]): Course[] {
  const storedMap = new Map(stored.map(c => [c.id, c]))
  return fresh.map(c => {
    const existing = storedMap.get(c.id)
    return existing ? { ...c, color: existing.color, hidden: existing.hidden } : c
  })
}

export async function syncAll(
  baseUrl: string,
  icalUrl: string,
  sessionCookie: string,
  lookaheadDays: number,
  storedCourses: Course[],
  cseSiteUrls: CseSiteEntry[] = [],
): Promise<SyncResult> {
  const token = getToken()

  let canvasAssignments: Assignment[] = []
  let finalCourses: Course[] = []

  if (token) {
    const freshCourses = await fetchCoursesFromApi(baseUrl, token)
    finalCourses = mergeCourses(freshCourses, storedCourses)
    canvasAssignments = await fetchPlannerItems(baseUrl, token, lookaheadDays, finalCourses)
  } else if (sessionCookie) {
    try {
      const result = await fetchAssignmentsViaGraphQL(baseUrl, sessionCookie, lookaheadDays, storedCourses)
      canvasAssignments = result.assignments
      finalCourses = mergeCourses(result.courses, storedCourses)
    } catch (e) {
      console.error('GraphQL sync failed, falling back to iCal:', e instanceof Error ? e.message : e)
      if (icalUrl) canvasAssignments = await fetchAssignmentsFromIcal(icalUrl, lookaheadDays)
    }
  } else if (icalUrl) {
    canvasAssignments = await fetchAssignmentsFromIcal(icalUrl, lookaheadDays)
  }

  if (canvasAssignments.length === 0 && finalCourses.length === 0 && cseSiteUrls.length === 0) {
    return { assignments: [], courses: [] }
  }

  // Augment with CSE course site data
  if (cseSiteUrls.length > 0) {
    const allCseAssignments = (
      await Promise.all(cseSiteUrls.map(entry => scrapeCseSite(entry, finalCourses)))
    ).flat()
    canvasAssignments = mergeCseAssignments(canvasAssignments, allCseAssignments)
  }

  return { assignments: canvasAssignments, courses: finalCourses }
}

// ── iCal path (Phase 1, kept as fallback) ───────────────────────────────────

const COURSE_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444',
  '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6',
]

function courseColorFromName(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return COURSE_COLORS[h % COURSE_COLORS.length]
}

const DAY_MS = 86_400_000
// iCal has no submission state, so past assignments are kept (and shown as
// overdue) only within this window. Older ones are dropped.
const ICAL_PAST_WINDOW_DAYS = 3

// Canvas copy-feed buttons sometimes hand out webcal:// links; axios needs https://
export function normalizeIcalUrl(url: string): string {
  return url.trim().replace(/^webcal:\/\//i, 'https://')
}

// Canvas UIDs: "event-assignment-12345" for assignments,
// "event-calendar-event-12345" for calendar events (meetings, office hours)
export function icalTypeFromUid(uid: string): Assignment['type'] {
  return /^event-calendar-event-/i.test(uid) ? 'event' : 'assignment'
}

// Canvas exports 11:59 PM deadlines as date-only values (DTSTART;VALUE=DATE:20261007).
// toJSDate() would turn those into midnight, so rebuild them as local 11:59 PM.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function icalDueDate(dtstart: any): Date {
  if (dtstart.isDate) return new Date(dtstart.year, dtstart.month - 1, dtstart.day, 23, 59, 0, 0)
  return dtstart.toJSDate() as Date
}

// Assignment UID gives the assignment ID; the URL property
// (".../calendar?include_contexts=course_123...") gives the course ID
export function icalAssignmentUrl(uid: string, eventUrl: string, baseUrl: string): string | null {
  const assignmentId = uid.match(/^event-assignment-(\d+)/i)?.[1]
  const courseId = eventUrl.match(/course_(\d+)/)?.[1]
  const base = baseUrl.replace(/\/+$/, '')
  if (!assignmentId || !courseId || !base) return null
  return `${base}/courses/${courseId}/assignments/${assignmentId}`
}

async function fetchAssignmentsFromIcal(icalUrl: string, lookaheadDays: number): Promise<Assignment[]> {
  const feedUrl = normalizeIcalUrl(icalUrl)
  // Links point at the school hosting the feed, whatever the Canvas URL setting says
  const baseUrl = new URL(feedUrl).origin
  const response = await axios.get<string>(feedUrl, {
    timeout: 15_000,
    headers: { 'User-Agent': 'CanvasDashboard/1.0' },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let jcalData: any
  try {
    jcalData = ICAL.parse(response.data)
  } catch {
    throw new Error('Failed to parse iCal feed')
  }

  const comp = new ICAL.Component(jcalData)
  const vevents: unknown[] = comp.getAllSubcomponents('vevent')
  const nowMs = Date.now()
  const windowStart = nowMs - ICAL_PAST_WINDOW_DAYS * DAY_MS
  const windowEnd = nowMs + lookaheadDays * DAY_MS
  const assignments: Assignment[] = []

  for (const vevent of vevents) {
    try {
      const event = new ICAL.Event(vevent)
      const dtstart = event.startDate
      if (!dtstart) continue

      const dueDate = icalDueDate(dtstart)
      const dueMs = dueDate.getTime()
      if (dueMs < windowStart || dueMs > windowEnd) continue

      const dueAt = dueDate.toISOString()
      const summary: string = event.summary || 'Untitled'
      const description: string = event.description || ''
      const uid: string = event.uid || `ical-${Date.now()}-${Math.random()}`
      const type = icalTypeFromUid(uid)
      // A meeting that already happened is no longer useful
      if (type === 'event' && dueMs < nowMs) continue

      // Canvas iCal SUMMARY contains course name in brackets: "Assignment Title [COURSE CODE]"
      // Extract course name from brackets first, fall back to DESCRIPTION parsing
      let courseName = 'Unknown Course'
      let canvasUrl = ''

      const bracketMatch = summary.match(/\[([^\]]+)\]\s*$/)
      if (bracketMatch) {
        courseName = bracketMatch[1].trim()
      } else {
        const lines = description.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean)
        const urlIdx = lines.findIndex((l: string) => /^https?:\/\//i.test(l))
        if (urlIdx > 0) {
          courseName = lines[0]
        } else if (urlIdx >= 0) {
          // URL is first line — no course name in description
        } else if (lines.length > 0) {
          courseName = lines[0]
        }
        courseName = courseName.replace(/<[^>]+>/g, '').trim() || 'Unknown Course'
      }

      // Parsed URL property value, so folded (wrapped) feed lines are already joined
      const eventUrl = String(event.component.getFirstPropertyValue('url') ?? '')
      const assignmentUrl = icalAssignmentUrl(uid, eventUrl, baseUrl)
      if (assignmentUrl) {
        canvasUrl = assignmentUrl
      } else {
        // Fall back to the first link in the description
        const descLines = description.split(/\r?\n/).map((l: string) => l.trim())
        const urlLine = descLines.find((l: string) => /^https?:\/\//i.test(l))
        if (urlLine) canvasUrl = urlLine
      }

      assignments.push({
        id: uid,
        title: summary,
        courseId: courseName.toLowerCase().replace(/\W+/g, '_'),
        courseName,
        courseColor: courseColorFromName(courseName),
        dueAt,
        type,
        submissionState: 'unknown',
        pointsPossible: null,
        canvasUrl,
        // Only assignments reach here with a past due time, and only within the window
        isOverdue: dueMs < nowMs,
        source: 'ical',
      })
    } catch {
      // Skip malformed events, continue parsing
    }
  }

  return assignments
}
