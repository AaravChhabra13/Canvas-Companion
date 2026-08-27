import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  RefreshCw, Settings as SettingsIcon, BookOpen, Inbox, User,
  CheckCheck, ChevronRight, ArrowLeft, Plus,
  Calendar as CalendarIcon, Clock, Search, BellOff, X,
} from 'lucide-react'
import Fuse from 'fuse.js'
import { formatDistanceToNowStrict, isToday, format } from 'date-fns'
import { groupAssignments } from '../lib/groupAssignments'
import type { Assignment, Course, PersonalTask, Settings, SyncState } from '../shared/types'
import { personalToAssignment, formatLoad, getCourseColor, SETTINGS_DEFAULTS } from '../lib/panelHelpers'
import { TabButton } from './components/TabButton'
import { GroupedList, EmptyState, ExternalLinkIcon } from './components/GroupedList'
import { SnoozeContextMenu } from './components/SnoozeContextMenu'
import { AddTaskForm } from './components/AddTaskForm'
import { CalendarView } from './components/CalendarView'
import { SettingsPanel } from './components/SettingsPanel'

// ── Main Panel ────────────────────────────────────────────────────────────────

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
