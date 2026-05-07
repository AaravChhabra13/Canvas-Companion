import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  RefreshCw, Settings as SettingsIcon, BookOpen, Inbox, User,
  CheckCheck, ChevronRight, ChevronLeft, ArrowLeft, EyeOff, Bell, Plus, Plug,
  Calendar as CalendarIcon, Clock, Search, BellOff, X,
} from 'lucide-react'
import Fuse from 'fuse.js'
import { formatDistanceToNowStrict, isToday, format } from 'date-fns'
import { AssignmentItem } from './AssignmentItem'
import { groupAssignments, GROUP_ORDER, GROUP_LABELS } from '../lib/groupAssignments'
import type { Assignment, Course, CseSiteEntry, PersonalTask, Settings, SyncState } from '../shared/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function personalToAssignment(t: PersonalTask): Assignment {
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

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function formatLoad(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = minutes / 60
  return `${h % 1 === 0 ? h : h.toFixed(1)} hr${h !== 1 ? 's' : ''}`
}

function getCourseColor(courseName: string): string {
  const colors = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EC4899', '#14B8A6', '#EF4444', '#F97316']
  let hash = 0
  for (let i = 0; i < courseName.length; i++) {
    hash = courseName.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

// ── Tab button ────────────────────────────────────────────────────────────────

const TabButton = ({
  active, onClick, children,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
      active
        ? 'bg-white/10 text-foreground'
        : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
    }`}
  >
    {children}
  </button>
)

// ── Grouped assignment list ───────────────────────────────────────────────────

const TODAY_COLOR = 'hsl(35 80% 60%)'

const GroupedList = ({
  groups, completed, onToggle, estimates, onSetEstimate, showEstimate,
  compact = false, itemCompact = false, onSnooze,
}: {
  groups: ReturnType<typeof groupAssignments>
  completed: Set<string>
  onToggle: (id: string) => void
  estimates: Record<string, number>
  onSetEstimate: (id: string, minutes: number | null) => void
  showEstimate: boolean
  compact?: boolean
  itemCompact?: boolean
  onSnooze?: (id: string, position: { x: number; y: number }) => void
}) => (
  <div className={`${compact ? '' : 'p-4'} flex flex-col gap-5`}>
    {GROUP_ORDER.map((key) => {
      const items = groups[key]
      if (!items.length) return null
      const labelColor =
        key === 'overdue' ? 'hsl(var(--danger))'
        : key === 'today' ? TODAY_COLOR
        : 'hsl(var(--muted-foreground))'
      return (
        <section key={key} className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: labelColor }}>
              {GROUP_LABELS[key]}
            </h2>
            <span className="text-[10px] text-muted-foreground/60">{items.length}</span>
            <div className="flex-1 h-px bg-white/5" />
          </div>
          <div className="flex flex-col gap-1.5">
            {items.map((a, i) => (
              <AssignmentItem
                key={a.id}
                assignment={a}
                index={i}
                completed={completed.has(a.id)}
                onToggleComplete={onToggle}
                estimate={estimates[a.id]}
                onSetEstimate={onSetEstimate}
                showEstimate={showEstimate}
                compact={itemCompact}
                onSnooze={onSnooze}
              />
            ))}
          </div>
        </section>
      )
    })}
  </div>
)

// ── Empty state ───────────────────────────────────────────────────────────────

const EmptyState = () => (
  <div className="p-8 flex flex-col items-center text-center gap-4 mt-6">
    <div
      className="w-16 h-16 rounded-2xl flex items-center justify-center"
      style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--shadow-glow)' }}
    >
      <BookOpen className="w-8 h-8 text-primary-foreground" />
    </div>
    <div>
      <h3 className="text-base font-semibold mb-1">No assignments found</h3>
      <p className="text-xs text-muted-foreground leading-relaxed max-w-70">
        All clear! No upcoming assignments right now.
      </p>
    </div>
  </div>
)


function ExternalLinkIcon() {
  return (
    <svg className="w-3 h-3 text-muted-foreground/40 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

// ── Snooze context menu ───────────────────────────────────────────────────────

function SnoozeContextMenu({
  x, y, assignmentId, onSnooze, onClose,
}: {
  x: number; y: number; assignmentId: string
  onSnooze: (id: string, until: string) => void
  onClose: () => void
}) {
  function snooze1Hour() {
    onSnooze(assignmentId, new Date(Date.now() + 60 * 60 * 1000).toISOString())
  }
  function snoozeTomorrow() {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(9, 0, 0, 0)
    onSnooze(assignmentId, d.toISOString())
  }
  function snoozeNextSync() {
    onSnooze(assignmentId, 'next-sync')
  }

  return (
    <div
      className="absolute z-50 glass rounded-xl shadow-xl py-1.5 min-w-42"
      style={{ left: Math.min(x, 170), top: Math.min(y, 400) }}
      onClick={e => e.stopPropagation()}
    >
      <button onClick={snooze1Hour} className="w-full text-left px-4 py-2 text-xs hover:bg-white/5 transition-colors">
        Snooze 1 hour
      </button>
      <button onClick={snoozeTomorrow} className="w-full text-left px-4 py-2 text-xs hover:bg-white/5 transition-colors">
        Snooze until tomorrow
      </button>
      <button onClick={snoozeNextSync} className="w-full text-left px-4 py-2 text-xs hover:bg-white/5 transition-colors">
        Snooze until next sync
      </button>
      <div className="h-px bg-white/5 mx-2 my-0.5" />
      <button onClick={onClose} className="w-full text-left px-4 py-2 text-xs text-muted-foreground hover:bg-white/5 transition-colors">
        Cancel
      </button>
    </div>
  )
}

// ── Calendar view ─────────────────────────────────────────────────────────────

function getDayBackground(count: number, hasOverdue: boolean): string {
  if (hasOverdue) return 'rgba(185, 28, 28, 0.85)'
  if (count === 0) return 'transparent'
  if (count <= 2) return 'rgba(245, 158, 11, 0.25)'
  if (count <= 4) return 'rgba(249, 115, 22, 0.45)'
  return 'rgba(239, 68, 68, 0.65)'
}

function CalendarView({
  assignments, completed, onToggle, estimates, onSetEstimate, showEstimate, onSnooze,
}: {
  assignments: Assignment[]
  completed: Set<string>
  onToggle: (id: string) => void
  estimates: Record<string, number>
  onSetEstimate: (id: string, minutes: number | null) => void
  showEstimate: boolean
  onSnooze?: (id: string, position: { x: number; y: number }) => void
}) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), 1)
  })
  const [selectedKey, setSelectedKey] = useState<string | null>(() => dateKey(new Date()))

  const heatmap = useMemo(() => {
    const map = new Map<string, { count: number; points: number; assignments: Assignment[] }>()
    for (const a of assignments) {
      if (!a.dueAt) continue
      const d = new Date(a.dueAt)
      const k = dateKey(d)
      const existing = map.get(k) ?? { count: 0, points: 0, assignments: [] }
      existing.count += 1
      existing.points += a.pointsPossible ?? 0
      existing.assignments.push(a)
      map.set(k, existing)
    }
    return map
  }, [assignments])

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const firstDow = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: Array<{ date: Date | null; k: string }> = []
    for (let i = 0; i < firstDow; i++) cells.push({ date: null, k: `e${i}` })
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d)
      cells.push({ date, k: dateKey(date) })
    }
    return cells
  }, [currentMonth])

  const today = new Date()
  const todayK = dateKey(today)
  const monthLabel = format(currentMonth, 'MMMM yyyy')
  const prevMonth = () => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))
  const nextMonth = () => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))
  const selectedData = selectedKey ? heatmap.get(selectedKey) : null

  return (
    <div className="p-4 flex flex-col gap-3">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-white/8 transition-colors text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold">{monthLabel}</span>
        <button onClick={nextMonth} className="p-1 rounded-lg hover:bg-white/8 transition-colors text-muted-foreground hover:text-foreground">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <div key={d} className="text-center text-[10px] text-muted-foreground/60 py-0.5">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {calendarDays.map(({ date, k }) => {
          if (!date) return <div key={k} className="aspect-square" />

          const data = heatmap.get(k)
          const isT = k === todayK
          const isSel = k === selectedKey
          const badges = data?.assignments ?? []

          return (
            <button
              key={k}
              onClick={() => setSelectedKey(isSel ? null : k)}
              className="aspect-square p-1 flex flex-col items-start gap-0.5 text-left transition-colors overflow-hidden"
              style={isSel
                ? { background: 'hsl(212 90% 60% / 0.25)', borderRadius: '6px', outline: '1px solid hsl(212 90% 60% / 0.5)' }
                : { background: getDayBackground(badges.length, badges.some(a => a.isOverdue)), borderRadius: '6px', outline: 'none' }
              }
            >
              {isT ? (
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                  style={{ background: 'hsl(var(--primary))', color: 'white' }}
                >
                  {date.getDate()}
                </span>
              ) : (
                <span className="text-[10px] font-medium leading-none text-foreground/80">
                  {date.getDate()}
                </span>
              )}

              {badges.slice(0, 2).map((a, i) => {
                const code = a.courseName.split(' ')[0]
                const t = a.title.length > 8 ? a.title.slice(0, 8) + '…' : a.title
                return (
                  <span key={i} className="text-[9px] leading-tight truncate w-full text-foreground/60" title={`${a.courseName} — ${a.title}`}>
                    {code} · {t}
                  </span>
                )
              })}
              {badges.length > 2 && (
                <span className="text-[9px] text-foreground/40">+{badges.length - 2}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 justify-center flex-wrap">
        {[
          { color: 'rgba(245, 158, 11, 0.25)', label: '1–2' },
          { color: 'rgba(249, 115, 22, 0.45)', label: '3–4' },
          { color: 'rgba(239, 68, 68, 0.65)', label: '5+' },
          { color: 'rgba(185, 28, 28, 0.85)', label: 'overdue' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
            <span className="text-[9px] text-muted-foreground/60">{label}</span>
          </div>
        ))}
      </div>

      {/* Day detail panel */}
      {selectedData && selectedData.count > 0 && (
        <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
          <p className="text-[11px] text-muted-foreground px-1">
            {selectedData.count} assignment{selectedData.count !== 1 ? 's' : ''} due
          </p>
          {selectedData.assignments.map((a, i) => (
            <AssignmentItem
              key={a.id}
              assignment={a}
              index={i}
              completed={completed.has(a.id)}
              onToggleComplete={onToggle}
              estimate={estimates[a.id]}
              onSetEstimate={onSetEstimate}
              showEstimate={showEstimate}
              onSnooze={onSnooze}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Settings panel ────────────────────────────────────────────────────────────

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: (v: boolean) => void }) {
  return (
    <button
      role="switch" aria-checked={enabled}
      onClick={() => onToggle(!enabled)}
      style={{
        flexShrink: 0,
        width: 40,
        height: 24,
        background: enabled ? 'hsl(212 90% 60%)' : 'hsl(0 0% 100% / 0.15)',
      }}
      className="relative rounded-full transition-colors overflow-hidden"
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0'}`}
      />
    </button>
  )
}

function SettingsPanel({
  settings, hideOldOverdue, onToggleHideOldOverdue, onSave,
}: {
  settings: Settings
  hideOldOverdue: boolean
  onToggleHideOldOverdue: (v: boolean) => void
  onSave: (s: Partial<Settings>, c?: Course[]) => Promise<void>
}) {
  const [baseUrl, setBaseUrl] = useState(settings.canvasBaseUrl)
  const [icalUrl, setIcalUrl] = useState(settings.canvasIcalUrl)
  const [cookieInput, setCookieInput] = useState('')
  const [showCookie, setShowCookie] = useState(false)
  const [hasCookie, setHasCookie] = useState(false)
  const [cookieSaving, setCookieSaving] = useState(false)
  const [syncInterval, setSyncInterval] = useState(settings.syncIntervalMinutes)
  const [lookaheadDays, setLookaheadDays] = useState(settings.lookaheadDays ?? 14)
  const [leadTimes, setLeadTimes] = useState(new Set(settings.notificationLeadTimes))
  const [notifsEnabled, setNotifsEnabled] = useState(settings.notificationLeadTimes.length > 0)
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [tokenStatus, setTokenStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [tokenError, setTokenError] = useState('')
  const [hasExistingToken, setHasExistingToken] = useState(false)
  const [cseSiteUrls, setCseSiteUrls] = useState<CseSiteEntry[]>([])
  const [newCseUrl, setNewCseUrl] = useState('')
  const [newCseCourseName, setNewCseCourseName] = useState('')
  const [cseSaving, setCseSaving] = useState(false)
  const [showTimeEstimatesSetting, setShowTimeEstimatesSetting] = useState(settings.showTimeEstimates ?? false)
  const [localViewMode, setLocalViewMode] = useState<'compact' | 'expanded'>(settings.viewMode ?? 'expanded')
  const [savedToast, setSavedToast] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const digest = settings.dailyDigest ?? { enabled: false, hour: 8, minute: 0 }
  const [digestEnabled, setDigestEnabled] = useState(digest.enabled)
  const [digestHour, setDigestHour] = useState(() => {
    const h = digest.hour
    if (h === 0) return 12
    if (h > 12) return h - 12
    return h
  })
  const [digestAmPm, setDigestAmPm] = useState<'AM' | 'PM'>(digest.hour < 12 ? 'AM' : 'PM')

  useEffect(() => {
    window.ipcRenderer.invoke('token:check').then((v: unknown) => setHasExistingToken(v as boolean))
    window.ipcRenderer.invoke('cookie:check').then((v: unknown) => setHasCookie(v as boolean))
    window.ipcRenderer.invoke('cse-sites:get').then((v: unknown) => setCseSiteUrls(v as CseSiteEntry[]))
  }, [])

  function showSaved() {
    setSavedToast(true)
    setTimeout(() => setSavedToast(false), 1500)
  }

  async function autoSave(patch: Partial<Settings>, triggerSync = false) {
    await onSave(patch)
    if (triggerSync) window.ipcRenderer.send('sync:trigger')
    showSaved()
  }

  function debouncedSave(patch: Partial<Settings>, triggerSync = false) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => autoSave(patch, triggerSync), 500)
  }

  function getActualHour(hour: number, ampm: 'AM' | 'PM') {
    return ampm === 'AM' ? (hour === 12 ? 0 : hour) : (hour === 12 ? 12 : hour + 12)
  }

  async function handleAddCseSite() {
    const url = newCseUrl.trim()
    const name = newCseCourseName.trim()
    if (!url || !name) return
    setCseSaving(true)
    const updated = [...cseSiteUrls, { url, courseName: name }]
    const saved = await window.ipcRenderer.invoke('cse-sites:save', updated) as CseSiteEntry[]
    setCseSiteUrls(saved)
    setNewCseUrl('')
    setNewCseCourseName('')
    setCseSaving(false)
    showSaved()
  }

  async function handleRemoveCseSite(index: number) {
    const updated = cseSiteUrls.filter((_, i) => i !== index)
    const saved = await window.ipcRenderer.invoke('cse-sites:save', updated) as CseSiteEntry[]
    setCseSiteUrls(saved)
    showSaved()
  }

  const toggleLead = (v: number) => {
    const next = new Set(leadTimes)
    next.has(v) ? next.delete(v) : next.add(v)
    setLeadTimes(next)
    if (notifsEnabled) autoSave({ notificationLeadTimes: [...next] })
  }

  async function handleTestToken() {
    setTokenStatus('testing'); setTokenError('')
    const valid = await window.ipcRenderer.invoke('token:validate', baseUrl.trim(), token.trim()) as boolean
    if (valid) {
      await window.ipcRenderer.invoke('token:save', token.trim())
      setTokenStatus('ok'); setHasExistingToken(true); setToken('')
      window.ipcRenderer.send('sync:trigger')
      showSaved()
    } else {
      setTokenStatus('error'); setTokenError('Invalid token or wrong Canvas URL.')
    }
  }

  async function handleRemoveToken() {
    await window.ipcRenderer.invoke('token:delete')
    setHasExistingToken(false); setTokenStatus('idle')
    showSaved()
  }

  async function handleSaveCookie() {
    if (!cookieInput.trim()) return
    setCookieSaving(true)
    await window.ipcRenderer.invoke('cookie:save', cookieInput.trim())
    setHasCookie(true)
    setCookieInput('')
    setCookieSaving(false)
    window.ipcRenderer.send('sync:trigger')
    showSaved()
  }

  async function handleClearCookie() {
    await window.ipcRenderer.invoke('cookie:clear')
    setHasCookie(false)
    showSaved()
  }

  const inputCls = 'w-full glass-inset rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/50'
  const sectionLbl = 'text-xs uppercase tracking-wider text-muted-foreground'
  const rowCls = 'glass-inset rounded-xl p-3 flex items-center justify-between gap-3'

  return (
    <div className="flex flex-col">
      <div className="p-5 flex flex-col gap-5">

        {/* Saved toast */}
        <AnimatePresence>
          {savedToast && (
            <motion.div
              key="saved-toast"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px] font-medium"
              style={{ background: 'hsl(var(--success) / 0.15)', color: 'hsl(var(--success))' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Saved
            </motion.div>
          )}
        </AnimatePresence>

        {/* 1. Canvas URL */}
        <div className="flex flex-col gap-2">
          <label className={sectionLbl}>Canvas URL</label>
          <input
            type="url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
            onBlur={() => autoSave({ canvasBaseUrl: baseUrl.trim() || 'https://canvas.uw.edu' }, true)}
            onKeyDown={e => { if (e.key === 'Enter') autoSave({ canvasBaseUrl: baseUrl.trim() || 'https://canvas.uw.edu' }, true) }}
            placeholder="https://canvas.uw.edu" spellCheck={false} className={inputCls}
          />
        </div>

        {/* 2. UW CSE Course Sites */}
        <div className="flex flex-col gap-2">
          <label className={sectionLbl}>UW CSE Course Sites</label>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Add your CSE course websites to pull assignments directly from course pages
          </p>
          {cseSiteUrls.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {cseSiteUrls.map((entry, i) => (
                <div key={i} className="glass-inset rounded-xl px-3 py-2 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{entry.courseName}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{entry.url}</div>
                  </div>
                  <button onClick={() => handleRemoveCseSite(i)}
                    className="text-[10px] px-2 py-1 rounded-lg hover:bg-white/5 transition-colors shrink-0"
                    style={{ color: 'hsl(var(--danger))' }}>Remove</button>
                </div>
              ))}
            </div>
          )}
          <input type="url" value={newCseUrl} onChange={e => setNewCseUrl(e.target.value)}
            placeholder="https://courses.cs.washington.edu/courses/cseXXX/26sp/"
            spellCheck={false} className={inputCls} />
          <input type="text" value={newCseCourseName} onChange={e => setNewCseCourseName(e.target.value)}
            placeholder="Course name (e.g. CSE 123)"
            spellCheck={false} className={inputCls}
            onKeyDown={e => { if (e.key === 'Enter') handleAddCseSite() }} />
          <button onClick={handleAddCseSite}
            disabled={!newCseUrl.trim() || !newCseCourseName.trim() || cseSaving}
            className="text-xs py-2 rounded-xl font-medium text-primary-foreground disabled:opacity-40 transition-opacity"
            style={{ background: 'var(--gradient-primary)' }}>
            {cseSaving ? 'Adding…' : 'Add Site'}
          </button>
        </div>

        {/* 3. Display */}
        <div className="flex flex-col gap-2">
          <label className={sectionLbl}>Display</label>
          <div className={rowCls}>
            <div className="min-w-0">
              <div className="text-sm font-medium">Compact view</div>
              <div className="text-[11px] text-muted-foreground leading-snug">Show only title and due date, smaller rows</div>
            </div>
            <Toggle enabled={localViewMode === 'compact'} onToggle={v => {
              const newMode = v ? 'compact' : 'expanded'
              setLocalViewMode(newMode)
              autoSave({ viewMode: newMode })
            }} />
          </div>
          <div className={rowCls}>
            <div className="flex items-center gap-2 min-w-0">
              <EyeOff className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium">Hide old overdue</div>
                <div className="text-[11px] text-muted-foreground leading-snug">Auto-hide assignments overdue by more than 24h</div>
              </div>
            </div>
            <Toggle enabled={hideOldOverdue} onToggle={v => { onToggleHideOldOverdue(v); showSaved() }} />
          </div>
          <div className={rowCls}>
            <div className="flex items-center gap-2 min-w-0">
              <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium">Show time estimates</div>
                <div className="text-[11px] text-muted-foreground leading-snug">Track daily workload with time tags on assignments</div>
              </div>
            </div>
            <Toggle enabled={showTimeEstimatesSetting} onToggle={v => {
              setShowTimeEstimatesSetting(v)
              autoSave({ showTimeEstimates: v })
            }} />
          </div>
        </div>

        {/* 4. Notifications */}
        <div className="flex flex-col gap-2">
          <label className={sectionLbl}>Notifications</label>
          <div className={rowCls}>
            <div className="flex items-center gap-2 min-w-0">
              <Bell className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="text-sm font-medium">Enable notifications</div>
            </div>
            <Toggle enabled={notifsEnabled} onToggle={v => {
              setNotifsEnabled(v)
              autoSave({ notificationLeadTimes: v ? [...leadTimes] : [] })
            }} />
          </div>
          {notifsEnabled && (
            <div className="flex flex-col gap-1.5">
              {[
                { label: '24 hours before due', value: 1440 },
                { label: '12 hours before due', value: 720 },
                { label: '2 hours before due', value: 120 },
                { label: '30 minutes before due', value: 30 },
                { label: '15 minutes before due', value: 15 },
              ].map(({ label, value }) => (
                <div key={value} className="glass-inset rounded-xl px-3 py-1.5 flex items-center justify-between gap-3">
                  <span className="text-sm text-foreground/80">{label}</span>
                  <Toggle enabled={leadTimes.has(value)} onToggle={() => toggleLead(value)} />
                </div>
              ))}
            </div>
          )}
          <div className="glass-inset rounded-xl p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium">Daily digest</div>
                  <div className="text-[11px] text-muted-foreground leading-snug">Morning summary of your assignments</div>
                </div>
              </div>
              <Toggle enabled={digestEnabled} onToggle={v => {
                setDigestEnabled(v)
                autoSave({ dailyDigest: { enabled: v, hour: getActualHour(digestHour, digestAmPm), minute: 0 } })
              }} />
            </div>
            {digestEnabled && (
              <div className="flex items-center gap-2 pl-6">
                <span className="text-xs text-muted-foreground">Send at</span>
                <select value={digestHour} onChange={e => {
                  const v = Number(e.target.value)
                  setDigestHour(v)
                  debouncedSave({ dailyDigest: { enabled: digestEnabled, hour: getActualHour(v, digestAmPm), minute: 0 } })
                }}
                  className="glass-inset rounded-lg px-2 py-1 text-xs text-foreground outline-none">
                  {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(h => <option key={h} value={h}>{h}:00</option>)}
                </select>
                <select value={digestAmPm} onChange={e => {
                  const v = e.target.value as 'AM' | 'PM'
                  setDigestAmPm(v)
                  debouncedSave({ dailyDigest: { enabled: digestEnabled, hour: getActualHour(digestHour, v), minute: 0 } })
                }}
                  className="glass-inset rounded-lg px-2 py-1 text-xs text-foreground outline-none">
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* 5. Sync interval + Lookahead days */}
        <div className="flex flex-col gap-2">
          <label className={sectionLbl}>Sync</label>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-muted-foreground">Auto-sync interval</label>
            <select value={syncInterval} onChange={e => {
              const v = Number(e.target.value)
              setSyncInterval(v)
              debouncedSave({ syncIntervalMinutes: v })
            }} className={`${inputCls} appearance-auto`}>
              {[15, 30, 60].map(v => <option key={v} value={v}>{v} minutes</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1 flex-nowrap">
                <label className="text-[11px] text-muted-foreground whitespace-nowrap">Assignment Look Ahead</label>
                <span className="text-[11px] text-foreground/60 whitespace-nowrap">· {lookaheadDays} days</span>
              </div>
              <span className="text-[10px] text-muted-foreground/60">Shows assignments up to {lookaheadDays} days ahead</span>
            </div>
            <select value={lookaheadDays} onChange={e => {
              const v = Number(e.target.value)
              setLookaheadDays(v)
              debouncedSave({ lookaheadDays: v })
            }} className={`${inputCls} appearance-auto`}>
              {[7, 14, 30, 60, 90].map(v => <option key={v} value={v}>{v} days</option>)}
            </select>
          </div>
        </div>

        {/* 6. Canvas iCal Feed URL */}
        <div className="flex flex-col gap-2">
          <label className={sectionLbl}>Canvas iCal Feed URL</label>
          <textarea value={icalUrl} onChange={e => setIcalUrl(e.target.value)}
            onBlur={() => autoSave({ canvasIcalUrl: icalUrl.trim() }, true)}
            placeholder="https://canvas.uw.edu/feeds/calendars/user_….ics"
            rows={3} spellCheck={false} className={`${inputCls} resize-none`} />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Canvas → Calendar → <span className="text-foreground">Calendar Feed</span> (bottom of page)
          </p>
        </div>

        {/* 7. API Token */}
        <div className="flex flex-col gap-2">
          <label className={sectionLbl}>API Token</label>
          {hasExistingToken ? (
            <div className="flex items-center gap-3">
              <span className="text-xs flex-1" style={{ color: 'hsl(var(--success))' }}>✓ Token saved in system keychain</span>
              <button onClick={handleRemoveToken} className="text-xs px-3 py-1.5 rounded-lg glass-inset hover:bg-white/5 transition-colors" style={{ color: 'hsl(var(--danger))' }}>Remove</button>
            </div>
          ) : (
            <>
              <div className="relative">
                <input type={showToken ? 'text' : 'password'} value={token}
                  onChange={e => { setToken(e.target.value); setTokenStatus('idle') }}
                  placeholder="Paste token from Canvas" spellCheck={false} className={`${inputCls} pr-12`} />
                <button onClick={() => setShowToken(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground hover:text-foreground">
                  {showToken ? 'Hide' : 'Show'}
                </button>
              </div>
              {tokenStatus === 'ok'    && <p className="text-xs" style={{ color: 'hsl(var(--success))' }}>✓ Verified and saved</p>}
              {tokenStatus === 'error' && <p className="text-xs" style={{ color: 'hsl(var(--danger))' }}>{tokenError}</p>}
              <button onClick={handleTestToken} disabled={!token.trim() || tokenStatus === 'testing'}
                className="text-xs py-2 rounded-xl font-medium text-primary-foreground disabled:opacity-40 transition-opacity"
                style={{ background: 'var(--gradient-primary)' }}>
                {tokenStatus === 'testing' ? 'Verifying…' : 'Test & Save Token'}
              </button>
            </>
          )}
        </div>

        {/* 8. Session Cookie (GraphQL) */}
        <div className="flex flex-col gap-2">
          <label className={sectionLbl}>Session Cookie (GraphQL)</label>
          {hasCookie ? (
            <div className="flex items-center gap-3">
              <span className="text-xs flex-1" style={{ color: 'hsl(var(--success))' }}>✓ Cookie saved — using GraphQL</span>
              <button onClick={handleClearCookie} className="text-xs px-3 py-1.5 rounded-lg glass-inset hover:bg-white/5 transition-colors" style={{ color: 'hsl(var(--danger))' }}>Clear</button>
            </div>
          ) : (
            <>
              <div className="relative">
                <input type={showCookie ? 'text' : 'password'} value={cookieInput}
                  onChange={e => setCookieInput(e.target.value)}
                  placeholder="Paste Cookie header value" spellCheck={false} className={`${inputCls} pr-12`} />
                <button onClick={() => setShowCookie(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground hover:text-foreground">
                  {showCookie ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                No cookie — using iCal feed. Get this from Chrome DevTools → Network → any Canvas request → Cookie header
              </p>
              <button onClick={handleSaveCookie} disabled={!cookieInput.trim() || cookieSaving}
                className="text-xs py-2 rounded-xl font-medium text-primary-foreground disabled:opacity-40 transition-opacity"
                style={{ background: 'var(--gradient-primary)' }}>
                {cookieSaving ? 'Saving…' : 'Save Cookie'}
              </button>
            </>
          )}
        </div>

        {/* 9. Reconnect */}
        <div className="flex flex-col gap-2">
          <button onClick={() => window.ipcRenderer.invoke('onboarding:reopen')}
            className="glass-inset flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
            <Plug className="w-3.5 h-3.5" />
            Reconnect / Change setup method
          </button>
        </div>

      </div>
    </div>
  )
}

// ── Add Task Form ─────────────────────────────────────────────────────────────

function MiniCalendar({ selected, onSelect }: { selected: string; onSelect: (val: string) => void }) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const startWeekday = new Date(viewYear, viewMonth, 1).getDay()
  const todayStr = today.toISOString().slice(0, 10)
  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1) }
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1) }
  return (
    <div className="glass-inset rounded-xl p-2">
      <div className="flex items-center justify-between mb-1 px-1">
        <button onClick={prevMonth} className="p-0.5 rounded hover:bg-white/10 transition-colors">
          <ChevronLeft className="w-3 h-3 text-muted-foreground" />
        </button>
        <span className="text-xs font-medium text-foreground">
          {format(new Date(viewYear, viewMonth, 1), 'MMMM yyyy')}
        </span>
        <button onClick={nextMonth} className="p-0.5 rounded hover:bg-white/10 transition-colors">
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>
      <div className="grid grid-cols-7 mb-0.5">
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] text-muted-foreground/60 py-0.5">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: startWeekday }, (_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isSelected = dateStr === selected
          const isCurrentDay = dateStr === todayStr
          return (
            <button key={day} onClick={() => onSelect(dateStr)}
              className={['text-[11px] rounded-md py-0.5 text-center transition-colors',
                isSelected ? 'bg-primary text-primary-foreground font-medium'
                  : isCurrentDay ? 'text-primary font-medium hover:bg-white/10'
                  : 'text-foreground/80 hover:bg-white/10'].join(' ')}>
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AddTaskForm({ onAdd, onCancel }: { onAdd: (title: string, dueAt: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [hour, setHour] = useState('11')
  const [minute, setMinute] = useState('00')
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('PM')
  const [showCal, setShowCal] = useState(false)
  const buildDueAt = () => {
    if (!dueDate) return ''
    let h = Number(hour)
    if (ampm === 'AM') h = h === 12 ? 0 : h
    else h = h === 12 ? 12 : h + 12
    const d = new Date(dueDate)
    d.setHours(h, Number(minute), 0, 0)
    return d.toISOString()
  }
  const submit = () => { if (title.trim()) onAdd(title.trim(), buildDueAt()) }
  const dateTriggerLabel = dueDate ? format(new Date(dueDate + 'T12:00:00'), 'EEE, MMM d') : 'No due date'
  return (
    <div className="mx-4 mb-3 p-3 glass-inset rounded-xl flex flex-col gap-2 shrink-0">
      <input
        autoFocus type="text" placeholder="Task title" value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }}
        className="w-full bg-transparent rounded-xl px-3 py-2 text-xs text-white/80 placeholder:text-white/30 outline-none focus:ring-1 focus:ring-primary/50 border border-white/20"
      />
      <button onClick={() => setShowCal(v => !v)}
        className="w-full glass-inset rounded-lg px-3 py-1.5 text-xs flex items-center justify-between">
        <span className={dueDate ? 'text-foreground' : 'text-muted-foreground/60'}>{dateTriggerLabel}</span>
        <CalendarIcon className="w-3 h-3 text-muted-foreground" />
      </button>
      {showCal && <MiniCalendar selected={dueDate} onSelect={d => { setDueDate(d); setShowCal(false) }} />}
      {dueDate && (
        <div className="flex items-center gap-1.5">
          <select value={hour} onChange={e => setHour(e.target.value)}
            className="glass-inset rounded-lg px-2 py-1.5 text-xs text-foreground outline-none appearance-auto">
            {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(h => (
              <option key={h} value={String(h)}>{h}</option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">:</span>
          <select value={minute} onChange={e => setMinute(e.target.value)}
            className="glass-inset rounded-lg px-2 py-1.5 text-xs text-foreground outline-none appearance-auto">
            {['00', '15', '30', '45'].map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <button onClick={() => setAmpm(v => v === 'AM' ? 'PM' : 'AM')}
            className="glass-inset rounded-lg px-2 py-1.5 text-xs text-foreground hover:bg-white/10 transition-colors">
            {ampm}
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
          Cancel
        </button>
        <button onClick={submit} disabled={!title.trim()}
          className="flex-1 py-1.5 rounded-lg text-xs font-medium text-primary-foreground disabled:opacity-40"
          style={{ background: title.trim() ? 'var(--gradient-primary)' : undefined }}>
          Add Task
        </button>
      </div>
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────

const SETTINGS_DEFAULTS: Settings = {
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

export default function Panel() {
  const [assignments, setAssignments]       = useState<Assignment[]>([])
  const [syncState, setSyncState]           = useState<SyncState>({ status: 'idle', lastSyncAt: null })
  const [settings, setSettings]             = useState<Settings>(SETTINGS_DEFAULTS)
  const [courses, setCourses]               = useState<Course[]>([])
  const [completedIds, setCompletedIds]     = useState<Set<string>>(new Set())
  const [personalTasks, setPersonalTasks]   = useState<PersonalTask[]>([])
  const [estimates, setEstimates]           = useState<Record<string, number>>({})
  const [showSettings, setShowSettings]     = useState(false)
  const [tab, setTab]                       = useState<'assignments' | 'courses' | 'calendar'>('assignments')
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null)
  const [hideOldOverdue, setHideOldOverdue] = useState(true)
  const [showAddTask, setShowAddTask]       = useState(false)
  const [viewMode, setViewMode]             = useState<'compact' | 'expanded'>('expanded')
  const [snoozeState, setSnoozeState]       = useState<Record<string, string>>({})
  const [showSnoozedPanel, setShowSnoozedPanel] = useState(false)
  const [contextMenu, setContextMenu]       = useState<{ assignmentId: string; x: number; y: number } | null>(null)
  const [showSearch, setShowSearch]         = useState(false)
  const [searchQuery, setSearchQuery]       = useState('')
  const [searchSelectedIdx, setSearchSelectedIdx] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    window.ipcRenderer.invoke('assignments:get').then((d: unknown) => setAssignments(d as Assignment[]))
    window.ipcRenderer.invoke('sync:status:get').then((s: unknown) => setSyncState(s as SyncState))
    window.ipcRenderer.invoke('settings:get').then((s: unknown) => {
      const loaded = { ...SETTINGS_DEFAULTS, ...(s as Settings) }
      setSettings(loaded)
      setHideOldOverdue(loaded.hideOldOverdue ?? true)
      setViewMode(loaded.viewMode ?? 'expanded')
    })
    window.ipcRenderer.invoke('courses:get').then((c: unknown) => setCourses(c as Course[]))
    window.ipcRenderer.invoke('completed:get').then((ids: unknown) => setCompletedIds(new Set(ids as string[])))
    window.ipcRenderer.invoke('tasks:get').then((t: unknown) => setPersonalTasks(t as PersonalTask[]))
    window.ipcRenderer.invoke('estimates:get').then((e: unknown) => setEstimates(e as Record<string, number>))
    window.ipcRenderer.invoke('snooze:get').then((s: unknown) => setSnoozeState(s as Record<string, string>))
  }, [])

  // ── Push subscriptions ───────────────────────────────────────────────────
  useEffect(() => {
    const onData = (_: unknown, d: Assignment[]) => {
      setAssignments(d)
      // Clear "next-sync" snoozes when new data arrives
      window.ipcRenderer.invoke('snooze:clear-next-sync').then((s: unknown) => setSnoozeState(s as Record<string, string>))
    }
    const onStatus  = (_: unknown, s: SyncState) => setSyncState(s)
    const onCourses = (_: unknown, c: Course[])  => setCourses(c)
    const onShown   = () => {
      setTab('assignments')
      setSelectedCourse(null)
      setShowSettings(false)
      setShowSearch(false)
      setSearchQuery('')
      setContextMenu(null)
      window.ipcRenderer.invoke('assignments:get').then((d: unknown) => setAssignments(d as Assignment[]))
      window.ipcRenderer.invoke('sync:status:get').then((s: unknown) => setSyncState(s as SyncState))
      window.ipcRenderer.invoke('courses:get').then((c: unknown) => setCourses(c as Course[]))
      window.ipcRenderer.invoke('completed:get').then((ids: unknown) => setCompletedIds(new Set(ids as string[])))
      window.ipcRenderer.invoke('tasks:get').then((t: unknown) => setPersonalTasks(t as PersonalTask[]))
      window.ipcRenderer.invoke('snooze:get').then((s: unknown) => setSnoozeState(s as Record<string, string>))
    }
    window.ipcRenderer.on('assignments:data', onData)
    window.ipcRenderer.on('sync:status',      onStatus)
    window.ipcRenderer.on('courses:data',     onCourses)
    window.ipcRenderer.on('panel:shown',      onShown)
    return () => {
      window.ipcRenderer.off('assignments:data', onData)
      window.ipcRenderer.off('sync:status',      onStatus)
      window.ipcRenderer.off('courses:data',     onCourses)
      window.ipcRenderer.off('panel:shown',      onShown)
    }
  }, [])

  // ── Panel resize when switching to/from Calendar tab ─────────────────────
  useEffect(() => {
    if (tab === 'calendar') {
      window.ipcRenderer.send('panel:resize', 480, 640)
    } else {
      window.ipcRenderer.send('panel:resize', 340, 520)
    }
  }, [tab])

  // ── Search helpers ───────────────────────────────────────────────────────
  function openSearch() {
    setShowSearch(true)
    setSearchQuery('')
    setSearchSelectedIdx(0)
    window.ipcRenderer.send('search:active', true)
  }

  function closeSearch() {
    setShowSearch(false)
    setSearchQuery('')
    setSearchSelectedIdx(0)
    window.ipcRenderer.send('search:active', false)
  }

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Cmd+K — toggle search bar
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        showSearch ? closeSearch() : openSearch()
        return
      }
      // Escape — close search, context menu, or panel
      if (e.key === 'Escape') {
        if (showSearch) { closeSearch(); return }
        if (contextMenu) { setContextMenu(null); return }
        window.ipcRenderer.send('panel:hide')
        return
      }
      // Left/right arrow — cycle tabs (ignore when typing in input/textarea)
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft' && !showSettings) {
        const tabs = ['assignments', 'courses', 'calendar'] as const
        const idx = tabs.indexOf(tab)
        switchTab(tabs[(idx - 1 + 3) % 3])
      }
      if (e.key === 'ArrowRight' && !showSettings) {
        const tabs = ['assignments', 'courses', 'calendar'] as const
        const idx = tabs.indexOf(tab)
        switchTab(tabs[(idx + 1) % 3])
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showSearch, contextMenu, showSettings, tab])

  // ── Actions ──────────────────────────────────────────────────────────────
  const triggerSync = useCallback(() => window.ipcRenderer.send('sync:trigger'), [])

  const saveSettings = useCallback(async (patch: Partial<Settings>, updatedCourses?: Course[]) => {
    const updated = await window.ipcRenderer.invoke('settings:set', patch) as Settings
    const merged = { ...SETTINGS_DEFAULTS, ...updated }
    setSettings(merged)
    setViewMode(merged.viewMode ?? 'expanded')
    if (updatedCourses) {
      const saved = await window.ipcRenderer.invoke('courses:save', updatedCourses) as Course[]
      setCourses(saved)
    }
  }, [])

  const handleToggleComplete = useCallback(async (id: string) => {
    const updated = await window.ipcRenderer.invoke('completed:toggle', id) as string[]
    setCompletedIds(new Set(updated))
  }, [])

  const handleSetEstimate = useCallback(async (id: string, minutes: number | null) => {
    const updated = await window.ipcRenderer.invoke('estimates:set', id, minutes) as Record<string, number>
    setEstimates(updated)
  }, [])

  const handleAddTask = useCallback(async (title: string, dueAtLocal: string) => {
    const newTask: PersonalTask = {
      id: `personal-${Date.now()}`,
      title,
      dueAt: dueAtLocal ? new Date(dueAtLocal).toISOString() : null,
      createdAt: new Date().toISOString(),
    }
    const saved = await window.ipcRenderer.invoke('tasks:save', [...personalTasks, newTask]) as PersonalTask[]
    setPersonalTasks(saved)
    setShowAddTask(false)
  }, [personalTasks])

  const handleToggleHideOldOverdue = useCallback(async (v: boolean) => {
    setHideOldOverdue(v)
    await window.ipcRenderer.invoke('settings:set', { hideOldOverdue: v })
  }, [])

  const handleSnoozeClick = useCallback((id: string, position: { x: number; y: number }) => {
    setContextMenu({ assignmentId: id, ...position })
  }, [])

  const handleSnooze = useCallback(async (id: string, until: string) => {
    const updated = await window.ipcRenderer.invoke('snooze:set', id, until) as Record<string, string>
    setSnoozeState(updated)
    setContextMenu(null)
  }, [])

  const handleUnsnooze = useCallback(async (id: string) => {
    const updated = await window.ipcRenderer.invoke('snooze:clear', id) as Record<string, string>
    setSnoozeState(updated)
  }, [])

  // ── Derived data ─────────────────────────────────────────────────────────
  const personalAssignments = useMemo(() => personalTasks.map(personalToAssignment), [personalTasks])
  const hiddenCourseIds = useMemo(() => new Set(courses.filter(c => c.hidden).map(c => c.id)), [courses])

  // ── Search index ─────────────────────────────────────────────────────────
  const searchableAssignments = useMemo(() =>
    [...assignments, ...personalAssignments].map(a => ({
      ...a,
      dueDateString: a.dueAt ? format(new Date(a.dueAt), 'MMM d yyyy EEEE') : 'no due date',
    })), [assignments, personalAssignments])

  const searchFuse = useMemo(() => new Fuse(searchableAssignments, {
    keys: ['title', 'courseName', 'dueDateString'],
    threshold: 0.3,
    includeScore: true,
  }), [searchableAssignments])

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    return searchFuse.search(searchQuery).slice(0, 8).map(r => r.item)
  }, [searchQuery, searchFuse])

  const visibleAssignments = useMemo(() => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
    const now = new Date()
    return [...assignments, ...personalAssignments].filter(a => {
      if (completedIds.has(a.id)) return false
      if (hiddenCourseIds.has(a.courseId)) return false
      if (hideOldOverdue && a.dueAt && new Date(a.dueAt).getTime() < oneDayAgo) return false
      // Snooze filter
      const until = snoozeState[a.id]
      if (until) {
        if (until === 'next-sync') return false
        if (new Date(until) > now) return false
      }
      return true
    })
  }, [assignments, personalAssignments, completedIds, hiddenCourseIds, hideOldOverdue, snoozeState])

  const snoozedAssignments = useMemo(() => {
    const now = new Date()
    return [...assignments, ...personalAssignments].filter(a => {
      const until = snoozeState[a.id]
      if (!until) return false
      if (until === 'next-sync') return true
      return new Date(until) > now
    })
  }, [assignments, personalAssignments, snoozeState])

  const overdueIds = useMemo(
    () => visibleAssignments.filter(a => a.isOverdue).map(a => a.id),
    [visibleAssignments],
  )

  const groups = useMemo(() => groupAssignments(visibleAssignments), [visibleAssignments])

  const courseList = useMemo(() => {
    const map = new Map<string, { id: string; name: string; total: number; overdue: number; upcoming: number }>()
    const now = Date.now()
    for (const a of [...assignments, ...personalAssignments]) {
      if (hiddenCourseIds.has(a.courseId)) continue
      if (a.courseId === '__personal__' && completedIds.has(a.id)) continue
      const entry = map.get(a.courseId) ?? { id: a.courseId, name: a.courseName, total: 0, overdue: 0, upcoming: 0 }
      entry.total += 1
      if (a.dueAt) {
        const t = new Date(a.dueAt).getTime()
        if (t < now && !completedIds.has(a.id)) entry.overdue += 1
        else if (t > now) entry.upcoming += 1
      }
      map.set(a.courseId, entry)
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [assignments, personalAssignments, completedIds, hiddenCourseIds])

  const courseCount = courseList.length
  const upcomingCount = useMemo(
    () => visibleAssignments.filter(a => a.dueAt && !a.isOverdue && new Date(a.dueAt) > new Date()).length,
    [visibleAssignments],
  )

  const courseAssignments = useMemo(() => {
    if (!selectedCourse) return []
    return visibleAssignments.filter(a => a.courseId === selectedCourse)
  }, [visibleAssignments, selectedCourse])

  const courseGroups = useMemo(() => groupAssignments(courseAssignments), [courseAssignments])

  const todayLoad = useMemo(() => {
    const todayItems = visibleAssignments.filter(a => a.dueAt && isToday(new Date(a.dueAt)) && !a.isOverdue)
    let total = 0; let hasAny = false
    for (const a of todayItems) {
      const mins = estimates[a.id]
      if (mins) { total += mins; hasAny = true }
    }
    return hasAny ? total : null
  }, [visibleAssignments, estimates])

  const clearOverdue = useCallback(async () => {
    for (const id of overdueIds) await handleToggleComplete(id)
  }, [overdueIds, handleToggleComplete])

  const showTimeEstimates = settings.showTimeEstimates ?? false
  const isCompact = viewMode === 'compact'
  const loading = syncState.status === 'syncing'
  const lastFetched = syncState.lastSyncAt ? new Date(syncState.lastSyncAt) : null

  function switchTab(next: 'assignments' | 'courses' | 'calendar') {
    setTab(next)
    setSelectedCourse(null)
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className="h-screen w-screen aurora"
      style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
      onClick={() => contextMenu && setContextMenu(null)}
    >
      <div className="glass relative w-full h-full flex flex-col overflow-hidden">

        {/* ── Search blur backdrop ── */}
        <AnimatePresence>
          {showSearch && (
            <motion.div
              key="search-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={closeSearch}
              style={{
                position: 'absolute',
                inset: 0,
                top: '64px',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                background: 'rgba(0,0,0,0.25)',
                zIndex: 10,
              }}
            />
          )}
        </AnimatePresence>

        {/* ── Search results ── */}
        <AnimatePresence>
          {showSearch && searchResults.length > 0 && (
            <motion.div
              key="search-results"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              style={{
                position: 'absolute',
                top: '72px',
                left: '12px',
                right: '12px',
                zIndex: 11,
                maxHeight: '300px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              {searchResults.map((a, i) => (
                <button
                  key={a.id}
                  onClick={() => { if (a.canvasUrl) window.ipcRenderer.send('open-external', a.canvasUrl); closeSearch() }}
                  onMouseEnter={() => setSearchSelectedIdx(i)}
                  className="flex items-center gap-3 text-left w-full"
                  style={{
                    background: 'rgba(30, 38, 68, 0.95)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '12px',
                    padding: '10px 12px',
                    cursor: 'pointer',
                    marginBottom: '6px',
                  }}
                >
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getCourseColor(a.courseName) }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: 'rgba(255,255,255,0.9)' }}>{a.title}</div>
                    <div className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      {a.courseName}{a.dueAt ? ` · ${format(new Date(a.dueAt), 'MMM d')}` : ''}
                    </div>
                  </div>
                  {a.canvasUrl && <ExternalLinkIcon />}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Snooze context menu ── */}
        {contextMenu && (
          <>
            <div className="absolute inset-0 z-40" onClick={() => setContextMenu(null)} />
            <SnoozeContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              assignmentId={contextMenu.assignmentId}
              onSnooze={handleSnooze}
              onClose={() => setContextMenu(null)}
            />
          </>
        )}

        {/* ── Header ── */}
        <header className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-white/5 shrink-0" style={{ position: 'relative', zIndex: 30 }}>
          {showSettings ? (
            <div className="flex items-center gap-2 w-full">
              <button onClick={() => setShowSettings(false)} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h2 className="text-base font-semibold">Settings</h2>
            </div>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              {showSearch ? (
                <motion.div
                  key="search"
                  initial={{ width: '40px', opacity: 0 }}
                  animate={{ width: '100%', opacity: 1 }}
                  exit={{ width: '40px', opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  style={{
                    transformOrigin: 'right center',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '12px',
                    padding: '6px 12px',
                    background: 'transparent',
                    backdropFilter: 'none',
                    WebkitBackdropFilter: 'none',
                    boxShadow: 'none',
                    marginLeft: 'auto',
                  }}
                >
                  <Search className="w-4 h-4 text-white/50 shrink-0" />
                  <input
                    ref={searchInputRef}
                    autoFocus
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setSearchSelectedIdx(0) }}
                    onKeyDown={e => {
                      if (e.key === 'Escape') { e.stopPropagation(); closeSearch(); return }
                      if (e.key === 'ArrowDown') { e.preventDefault(); setSearchSelectedIdx(i => Math.min(i + 1, searchResults.length - 1)); return }
                      if (e.key === 'ArrowUp') { e.preventDefault(); setSearchSelectedIdx(i => Math.max(i - 1, 0)); return }
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const item = searchResults[searchSelectedIdx]
                        if (item?.canvasUrl) window.ipcRenderer.send('open-external', item.canvasUrl)
                        closeSearch()
                      }
                    }}
                    placeholder="Search assignments…"
                    style={{ background: 'transparent', border: 'none', outline: 'none', color: 'white', flex: 1, fontSize: '14px' }}
                  />
                  <button onClick={closeSearch}>
                    <X className="w-4 h-4 text-white/50" />
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="header"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}
                >
                  <div>
                    <h1 className="text-lg font-semibold text-gradient">Canvas Companion</h1>
                    <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1">
                        <BookOpen className="w-3 h-3" /> {courseCount} courses
                      </span>
                      <span className="opacity-30">·</span>
                      <span className="inline-flex items-center gap-1">
                        <Inbox className="w-3 h-3" /> {upcomingCount} upcoming
                      </span>
                      {showTimeEstimates && todayLoad !== null && (
                        <>
                          <span className="opacity-30">·</span>
                          <span className="inline-flex items-center gap-1" style={{ color: 'hsl(35 80% 65%)' }}>
                            <Clock className="w-3 h-3" /> ~{formatLoad(todayLoad)}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={openSearch} className="p-2 rounded-lg hover:bg-white/5 transition-colors" title="Search (⌘K)">
                      <Search className="w-4 h-4" />
                    </button>
                    <button onClick={triggerSync} disabled={loading}
                      className="p-2 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-40" title="Refresh">
                      <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={() => setShowSettings(true)}
                      className="p-2 rounded-lg hover:bg-white/5 transition-colors" title="Settings">
                      <SettingsIcon className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </header>

        {/* ── Tabs ── */}
        {!showSettings && visibleAssignments.length > 0 && (
          <div className="px-4 pt-3 flex items-center gap-1 shrink-0">
            <TabButton active={tab === 'assignments'} onClick={() => switchTab('assignments')}>
              Assignments
            </TabButton>
            <TabButton active={tab === 'courses'} onClick={() => switchTab('courses')}>
              Courses <span className="ml-1 text-[10px] opacity-60">{courseCount}</span>
            </TabButton>
            <TabButton active={tab === 'calendar'} onClick={() => switchTab('calendar')}>
              <span className="inline-flex items-center gap-1">
                <CalendarIcon className="w-3 h-3" /> Calendar
              </span>
            </TabButton>
          </div>
        )}

        {/* ── Body ── */}
        <AnimatePresence mode="wait" initial={false}>
          {showSettings ? (
            <motion.div key="settings"
              initial={{ x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -24, opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }} className="flex-1 overflow-y-auto">
              <SettingsPanel settings={settings} hideOldOverdue={hideOldOverdue}
                onToggleHideOldOverdue={handleToggleHideOldOverdue} onSave={saveSettings} />
            </motion.div>
          ) : (
            <motion.div key="main"
              initial={{ x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 24, opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }} className="flex-1 overflow-y-auto">
              {visibleAssignments.length === 0 ? (
                <EmptyState />
              ) : tab === 'calendar' ? (
                <CalendarView
                  assignments={visibleAssignments} completed={completedIds} onToggle={handleToggleComplete}
                  estimates={estimates} onSetEstimate={handleSetEstimate} showEstimate={showTimeEstimates}
                  onSnooze={handleSnoozeClick}
                />
              ) : tab === 'assignments' ? (
                <GroupedList
                  groups={groups} completed={completedIds} onToggle={handleToggleComplete}
                  estimates={estimates} onSetEstimate={handleSetEstimate} showEstimate={showTimeEstimates}
                  itemCompact={isCompact} onSnooze={handleSnoozeClick}
                />
              ) : selectedCourse ? (
                /* Course drill-down */
                <div className="p-4 flex flex-col gap-3">
                  <button onClick={() => setSelectedCourse(null)}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit">
                    <ArrowLeft className="w-3.5 h-3.5" /> All courses
                  </button>
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      {courseList.find(c => c.id === selectedCourse)?.name ?? ''}
                    </h2>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {courseAssignments.length} assignment{courseAssignments.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  {courseAssignments.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-6 text-center">No assignments.</div>
                  ) : (
                    <GroupedList
                      groups={courseGroups} completed={completedIds} onToggle={handleToggleComplete}
                      estimates={estimates} onSetEstimate={handleSetEstimate} showEstimate={showTimeEstimates}
                      compact itemCompact={isCompact} onSnooze={handleSnoozeClick}
                    />
                  )}
                </div>
              ) : (
                /* Course list */
                <div className="p-4 flex flex-col gap-2">
                  {courseList.map(c => (
                    <button key={c.id} onClick={() => setSelectedCourse(c.id)}
                      className="glass-inset rounded-xl p-3 flex items-center gap-3 hover:bg-white/5 transition-colors text-left">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: c.id === '__personal__' ? 'linear-gradient(135deg, #8b5cf6, #6d28d9)' : 'var(--gradient-primary)' }}>
                        {c.id === '__personal__'
                          ? <User className="w-4 h-4 text-primary-foreground" />
                          : <BookOpen className="w-4 h-4 text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{c.name}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                          <span>{c.total} total</span>
                          {c.overdue > 0 && (<><span className="opacity-30">·</span><span style={{ color: 'hsl(var(--danger))' }}>{c.overdue} overdue</span></>)}
                          {c.upcoming > 0 && (<><span className="opacity-30">·</span><span>{c.upcoming} upcoming</span></>)}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Add Task Form */}
        {!showSettings && showAddTask && (
          <AddTaskForm onAdd={handleAddTask} onCancel={() => setShowAddTask(false)} />
        )}

        {/* Snoozed panel */}
        {!showSettings && showSnoozedPanel && snoozedAssignments.length > 0 && (
          <div className="border-t border-white/5 px-4 py-3 flex flex-col gap-2 max-h-48 overflow-y-auto shrink-0">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Snoozed</div>
            {snoozedAssignments.map(a => (
              <div key={a.id} className="glass-inset rounded-lg px-3 py-1.5 flex items-center gap-2" style={{ height: 32 }}>
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: getCourseColor(a.courseName) }} />
                <span className="flex-1 text-xs truncate">{a.title}</span>
                <button
                  onClick={() => handleUnsnooze(a.id)}
                  className="text-[10px] text-primary hover:text-foreground transition-colors shrink-0"
                >
                  Unsnooze
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Footer ── */}
        {!showSettings && (
          <footer className="px-5 py-2.5 border-t border-white/5 text-[10px] text-muted-foreground flex items-center justify-between gap-2 shrink-0">
            <span className="truncate">
              {lastFetched
                ? `Updated ${formatDistanceToNowStrict(lastFetched, { addSuffix: true })}`
                : 'Not synced'}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {snoozedAssignments.length > 0 && (
                <button
                  onClick={() => setShowSnoozedPanel(v => !v)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/5 transition-colors ${showSnoozedPanel ? 'text-primary' : 'text-foreground/60'}`}
                  title="Show snoozed assignments"
                >
                  <BellOff className="w-3 h-3" />
                  {snoozedAssignments.length} snoozed
                </button>
              )}
              {overdueIds.length > 0 && (
                <button onClick={clearOverdue}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/5 transition-colors text-foreground/80"
                  title="Mark all overdue as done">
                  <CheckCheck className="w-3 h-3" />
                  Clear {overdueIds.length} overdue
                </button>
              )}
              <button
                onClick={() => setShowAddTask(v => !v)}
                className={`p-1 rounded-md hover:bg-white/5 transition-colors ${showAddTask ? 'text-primary' : ''}`}
                title="Add personal task"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </footer>
        )}

      </div>
    </div>
  )
}
