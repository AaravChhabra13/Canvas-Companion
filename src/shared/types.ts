export interface Assignment {
  id: string
  title: string
  courseId: string
  courseName: string
  courseColor: string
  dueAt: string | null  // ISO 8601, null = no due date
  type: 'assignment' | 'quiz' | 'discussion' | 'announcement' | 'creative' | 'resubmission' | 'event'
  submissionState: 'submitted' | 'unsubmitted' | 'graded' | 'unknown'
  pointsPossible: number | null
  canvasUrl: string
  isOverdue: boolean
  source: 'rest' | 'ical' | 'graphql' | 'manual' | 'cse-site'
}

export interface CseSiteEntry {
  url: string
  courseName: string
}

export interface PersonalTask {
  id: string
  title: string
  dueAt: string | null
  createdAt: string
}

export interface BucketedAssignments {
  overdue: Assignment[]
  today: Assignment[]
  tomorrow: Assignment[]
  thisWeek: Assignment[]
  comingUp: Assignment[]
  noDueDate: Assignment[]
}

export type SyncStatus = 'idle' | 'syncing' | 'error'

export interface SyncState {
  status: SyncStatus
  lastSyncAt: string | null
  error?: string
}

export interface Course {
  id: string
  name: string
  color: string
  hidden: boolean
}

export interface DailyDigest {
  enabled: boolean
  hour: number    // 0–23
  minute: number
}

export interface Settings {
  canvasBaseUrl: string
  canvasIcalUrl: string
  canvasSessionCookie: string
  syncIntervalMinutes: number
  lookaheadDays: number
  notificationLeadTimes: number[]  // minutes before due date (e.g. 1440=24h, 120=2h, 30=30min)
  onboardingComplete: boolean
  hideOldOverdue: boolean
  dailyDigest: DailyDigest
  showTimeEstimates: boolean
  viewMode: 'compact' | 'expanded'
}
