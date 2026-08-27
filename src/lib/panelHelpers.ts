import type { Assignment, PersonalTask, Settings } from '../shared/types'

export function personalToAssignment(t: PersonalTask): Assignment {
  const now = new Date()
  return {
    id: t.id,
    title: t.title,
    courseId: '__personal__',
    courseName: 'Personal',
    courseColor: '#8b5cf6',
    dueAt: t.dueAt,
    type: 'assignment',
    submissionState: 'unknown',
    pointsPossible: null,
    canvasUrl: '',
    isOverdue: t.dueAt !== null && new Date(t.dueAt) < now,
    source: 'manual',
  }
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function formatLoad(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = minutes / 60
  return `${h % 1 === 0 ? h : h.toFixed(1)} hr${h !== 1 ? 's' : ''}`
}

export function getCourseColor(courseName: string): string {
  const colors = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EC4899', '#14B8A6', '#EF4444', '#F97316']
  let hash = 0
  for (let i = 0; i < courseName.length; i++) {
    hash = courseName.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

export const SETTINGS_DEFAULTS: Settings = {
  canvasBaseUrl: 'https://canvas.uw.edu',
  canvasIcalUrl: '',
  canvasSessionCookie: '',
  syncIntervalMinutes: 30,
  lookaheadDays: 14,
  notificationLeadTimes: [1440, 120, 30],
  onboardingComplete: true,
  hideOldOverdue: true,
  dailyDigest: { enabled: false, hour: 8, minute: 0 },
  showTimeEstimates: false,
  viewMode: 'expanded',
}
