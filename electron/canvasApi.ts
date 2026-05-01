import { safeStorage, app } from 'electron'
import Store from 'electron-store'
import axios from 'axios'
import type { Assignment, Course } from '../src/shared/types'

// Lazily-initialized so app.getPath() is not called before app.ready
let _tokenStore: Store<{ encryptedToken: string }> | null = null
function tokenStore(): Store<{ encryptedToken: string }> {
  if (!_tokenStore) {
    _tokenStore = new Store<{ encryptedToken: string }>({
      name: 'token',
      cwd: app.getPath('userData'),
      defaults: { encryptedToken: '' },
    })
  }
  return _tokenStore
}

// safeStorage uses the OS login keychain for its encryption key, so the hex
// blob on disk is meaningless without the OS account — same security model as keytar.
export function saveToken(token: string): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('safeStorage unavailable')
  const buf = safeStorage.encryptString(token)
  tokenStore().set('encryptedToken', buf.toString('hex'))
}

export function getToken(): string | null {
  const hex = tokenStore().get('encryptedToken')
  if (!hex) return null
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(hex, 'hex'))
  } catch {
    return null
  }
}

export function deleteToken(): void {
  tokenStore().set('encryptedToken', '')
}

export function hasToken(): boolean {
  const t = getToken()
  return t !== null && t.length > 0
}

export async function validateToken(baseUrl: string, token: string): Promise<boolean> {
  try {
    await axios.get(`${baseUrl}/api/v1/users/self`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10_000,
    })
    return true
  } catch {
    return false
  }
}

// ── REST API data fetching ───────────────────────────────────────────────────

const COURSE_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444',
  '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6',
]

function colorForIndex(i: number): string {
  return COURSE_COLORS[i % COURSE_COLORS.length]
}

interface CanvasCourse {
  id: number
  name: string
  course_code: string
}

interface CanvasPlannerItem {
  plannable_id: number
  plannable_type: string
  course_id?: number
  context_name?: string
  html_url?: string
  plannable?: {
    id: number
    title: string
    due_at?: string | null
    points_possible?: number | null
    html_url?: string
  }
  submissions?: {
    submitted?: boolean
    graded?: boolean
    late?: boolean
    missing?: boolean
  }
}

export async function fetchCoursesFromApi(baseUrl: string, token: string): Promise<Course[]> {
  const resp = await axios.get<CanvasCourse[]>(`${baseUrl}/api/v1/courses`, {
    params: { enrollment_state: 'active', per_page: 50 },
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15_000,
  })
  return resp.data
    .filter(c => c && c.id && c.name)
    .map((c, i) => ({
      id: String(c.id),
      name: c.name,
      color: colorForIndex(i),
      hidden: false,
    }))
}

export async function fetchPlannerItems(
  baseUrl: string,
  token: string,
  lookaheadDays: number,
  courses: Course[],
): Promise<Assignment[]> {
  const now = new Date()
  const endDate = new Date(now)
  endDate.setDate(endDate.getDate() + Math.min(lookaheadDays, 90))

  const courseMap = new Map(courses.map(c => [c.id, c]))

  const resp = await axios.get<CanvasPlannerItem[]>(`${baseUrl}/api/v1/planner/items`, {
    params: {
      per_page: 100,
      start_date: now.toISOString(),
      end_date: endDate.toISOString(),
    },
    headers: { Authorization: `Bearer ${token}` },
    timeout: 20_000,
  })

  const result: Assignment[] = []
  for (const item of resp.data) {
    try {
      const courseId = String(item.course_id ?? '')
      const course = courseMap.get(courseId)
      const courseName = course?.name ?? item.context_name ?? 'Unknown Course'
      const courseColor = course?.color ?? colorForIndex(parseInt(courseId, 10) || 0)

      const dueAt = item.plannable?.due_at ?? null
      const submitted = item.submissions?.submitted ?? false
      const graded = item.submissions?.graded ?? false
      const submissionState: Assignment['submissionState'] =
        graded ? 'graded' : submitted ? 'submitted' : 'unsubmitted'

      const rawUrl = item.html_url ?? item.plannable?.html_url ?? ''
      const canvasUrl = rawUrl.startsWith('/') ? `${baseUrl}${rawUrl}` : rawUrl

      result.push({
        id: `rest-${item.plannable_type}-${item.plannable_id}`,
        title: item.plannable?.title ?? 'Untitled',
        courseId,
        courseName,
        courseColor,
        dueAt,
        type: plannerTypeToType(item.plannable_type),
        submissionState,
        pointsPossible: item.plannable?.points_possible ?? null,
        canvasUrl,
        isOverdue: dueAt ? new Date(dueAt) < now && submissionState === 'unsubmitted' : false,
        source: 'rest',
      })
    } catch {
      // skip malformed planner items
    }
  }
  return result
}

function plannerTypeToType(t: string): Assignment['type'] {
  if (t === 'quiz') return 'quiz'
  if (t === 'discussion_topic') return 'discussion'
  if (t === 'announcement') return 'announcement'
  return 'assignment'
}
