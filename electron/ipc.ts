import { ipcMain, BrowserWindow, shell, app } from 'electron'
import Store from 'electron-store'
import { syncAll } from './sync'
import { saveToken, deleteToken, hasToken, validateToken, getToken } from './canvasApi'
import {
  rescheduleNotifications,
  initFiredKeys,
  pruneFiredKeys,
  requestNotificationPermission,
  updateDigestAssignments,
  scheduleDailyDigest,
} from './notifications'
import type { Assignment, Course, CseSiteEntry, PersonalTask, Settings, SyncState } from '../src/shared/types'

interface StoreSchema {
  settings: Settings
  courses: Course[]
  completedIds: string[]
  personalTasks: PersonalTask[]
  cseSiteUrls: CseSiteEntry[]
  estimates: Record<string, number>  // assignmentId → minutes
  snoozeState: Record<string, string>  // assignmentId → ISO date string | 'next-sync'
  notificationsFired: Record<string, true>
  appVersion: string
}

const SETTINGS_DEFAULTS: Settings = {
  canvasBaseUrl: 'https://canvas.uw.edu',
  canvasIcalUrl: '',
  canvasSessionCookie: '',
  syncIntervalMinutes: 30,
  lookaheadDays: 14,
  notificationLeadTimes: [1440, 720, 120, 30],  // 24 h, 12 h, 2 h, 30 min
  onboardingComplete: false,
  hideOldOverdue: true,
  dailyDigest: { enabled: false, hour: 8, minute: 0 },
  showTimeEstimates: false,
  viewMode: 'expanded' as const,
}

// Initialized inside setupIPC (after app.ready) so app.getPath() is available
let store: Store<StoreSchema>

let assignments: Assignment[] = []
let syncState: SyncState = { status: 'idle', lastSyncAt: null }
let syncTimer: ReturnType<typeof setInterval> | null = null

function getSettings(): Settings {
  return { ...SETTINGS_DEFAULTS, ...store.get('settings') }
}

export function isOnboarded(): boolean {
  return getSettings().onboardingComplete
}

export interface SetupIPCCallbacks {
  showPanel: () => void
  closeOnboarding: () => void
  openOnboarding: () => void
  hidePanel: () => void
  onBadgeUpdate: (overdue: number, today: number) => void
}

export interface SetupIPCResult {
  triggerSync: () => void
  isOnboardingComplete: boolean
  onWake: () => void
  triggerReschedule: () => void
}

export function setupIPC(
  getPanel: () => BrowserWindow | null,
  callbacks: SetupIPCCallbacks,
): SetupIPCResult {
  // Store is created here (not at module level) so app.getPath() is available
  store = new Store<StoreSchema>({ name: "app-store",
    cwd: app.getPath('userData'),
    defaults: {
      settings: SETTINGS_DEFAULTS,
      courses: [],
      completedIds: [],
      personalTasks: [],
      cseSiteUrls: [],
      estimates: {},
      snoozeState: {},
      notificationsFired: {},
      appVersion: '',
    },
  })

  const persistedFired = (store.get('notificationsFired') as Record<string, true> | undefined) ?? {}
  const firedKeysSet = new Set<string>(Object.keys(persistedFired))
  initFiredKeys(firedKeysSet, (keys) => {
    const obj: Record<string, true> = {}
    for (const k of keys) obj[k] = true
    store.set('notificationsFired', obj)
  })
  pruneFiredKeys()

  // ── First-launch / version-mismatch credential wipe ──────────────────────
  // Compares the stored appVersion against the running binary version.
  // A mismatch (including a missing value on a fresh install) means a new user
  // may have installed from the DMG and inherited a previous user's store data.
  // Wipe all credentials and reset onboarding so they start fresh.
  // Non-sensitive preferences (intervals, lead times, etc.) are kept.
  {
    const currentVersion = app.getVersion()
    const storedVersion = store.get('appVersion') as string
    if (!storedVersion || storedVersion !== currentVersion) {
      const current = getSettings()
      store.set('settings', {
        ...current,
        canvasIcalUrl: '',
        canvasSessionCookie: '',
        onboardingComplete: false,
      })
      deleteToken()
      store.set('appVersion', currentVersion)
    }
  }

  async function runSync(callbacks: SetupIPCCallbacks): Promise<void> {
    const settings = getSettings()
    if (!hasToken() && !settings.canvasSessionCookie && !settings.canvasIcalUrl) return

    syncState = { status: 'syncing', lastSyncAt: syncState.lastSyncAt }
    getPanel()?.webContents.send('sync:status', syncState)

    try {
      const storedCourses = store.get('courses') as Course[]
      const cseSiteUrls = store.get('cseSiteUrls') as CseSiteEntry[]
      const result = await syncAll(
        settings.canvasBaseUrl,
        settings.canvasIcalUrl,
        settings.canvasSessionCookie,
        settings.lookaheadDays,
        storedCourses,
        cseSiteUrls,
      )

      assignments = result.assignments
      console.log('[Sync] first 5 assignments canvasUrl check:',
        assignments.slice(0, 5).map(a => ({ id: a.id, source: a.source, title: a.title.slice(0, 40), canvasUrl: a.canvasUrl }))
      )
      if (result.courses.length > 0) store.set('courses', result.courses)

      syncState = { status: 'idle', lastSyncAt: new Date().toISOString() }
      getPanel()?.webContents.send('assignments:data', assignments)
      getPanel()?.webContents.send('sync:status', syncState)
      getPanel()?.webContents.send('courses:data', store.get('courses'))

      const completedIds = new Set(store.get('completedIds') as string[])
      rescheduleNotifications(assignments, settings.notificationLeadTimes, completedIds)
      updateDigestAssignments(assignments, completedIds)

      // Compute badge counts for tray icon
      const now = new Date()
      const todayEnd = new Date(now)
      todayEnd.setHours(23, 59, 59, 999)
      const overdueCount = assignments.filter(a => a.isOverdue && !completedIds.has(a.id)).length
      const todayCount = assignments.filter(a => {
        if (!a.dueAt || a.isOverdue) return false
        const d = new Date(a.dueAt)
        return d >= now && d <= todayEnd
      }).length
      callbacks.onBadgeUpdate(overdueCount, todayCount)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      syncState = { status: 'error', lastSyncAt: syncState.lastSyncAt, error: msg }
      getPanel()?.webContents.send('sync:status', syncState)
    }
  }

  function startSyncTimer(callbacks: SetupIPCCallbacks): void {
    if (syncTimer) {
      clearInterval(syncTimer)
      syncTimer = null
    }
    const intervalMs = getSettings().syncIntervalMinutes * 60_000
    syncTimer = setInterval(() => runSync(callbacks), intervalMs)
  }

  // ── Assignments & sync ────────────────────────────────────────────────────
  ipcMain.removeHandler('assignments:get')
  ipcMain.handle('assignments:get', () => assignments)
  ipcMain.removeHandler('sync:status:get')
  ipcMain.handle('sync:status:get', () => syncState)
  ipcMain.on('sync:trigger', () => runSync(callbacks))

  ipcMain.removeHandler('sync:run-and-wait')
  ipcMain.handle('sync:run-and-wait', async () => {
    await runSync(callbacks)
    return { count: assignments.length, error: syncState.error }
  })

  // ── Settings ──────────────────────────────────────────────────────────────
  ipcMain.removeHandler('settings:get')
  ipcMain.handle('settings:get', () => getSettings())

  ipcMain.removeHandler('settings:set')
  ipcMain.handle('settings:set', async (_event, patch: Partial<Settings>) => {
    const current = getSettings()
    const updated: Settings = { ...current, ...patch }
    store.set('settings', updated)
    if (patch.syncIntervalMinutes !== undefined) startSyncTimer(callbacks)
    if (patch.dailyDigest !== undefined) scheduleDailyDigest(updated.dailyDigest)
    const urlChanged =
      (patch.canvasIcalUrl !== undefined && patch.canvasIcalUrl !== current.canvasIcalUrl) ||
      (patch.canvasBaseUrl !== undefined && patch.canvasBaseUrl !== current.canvasBaseUrl) ||
      (patch.canvasSessionCookie !== undefined && patch.canvasSessionCookie !== current.canvasSessionCookie)
    if (urlChanged) await runSync(callbacks)
    return updated
  })

  ipcMain.on('open-external', (_event, url: string) => {
    if (!url) return
    let fullUrl = url
    if (url.startsWith('/')) {
      const settings = getSettings()
      fullUrl = `${settings.canvasBaseUrl}${url}`
    }
    if (fullUrl.startsWith('https://')) shell.openExternal(fullUrl)
  })

  // ── Token management ──────────────────────────────────────────────────────
  ipcMain.removeHandler('token:save')
  ipcMain.handle('token:save', (_event, token: string) => { saveToken(token); return true })
  ipcMain.removeHandler('token:check')
  ipcMain.handle('token:check', () => hasToken())
  ipcMain.removeHandler('token:delete')
  ipcMain.handle('token:delete', () => { deleteToken(); return true })
  ipcMain.removeHandler('token:validate')
  ipcMain.handle('token:validate', (_event, baseUrl: string, token: string) =>
    validateToken(baseUrl, token),
  )

  // ── Session cookie ────────────────────────────────────────────────────────
  ipcMain.removeHandler('cookie:save')
  ipcMain.handle('cookie:save', async (_event, cookie: string) => {
    const current = getSettings()
    store.set('settings', { ...current, canvasSessionCookie: cookie })
    await runSync(callbacks)
    return true
  })
  ipcMain.removeHandler('cookie:check')
  ipcMain.handle('cookie:check', () => !!getSettings().canvasSessionCookie)
  ipcMain.removeHandler('cookie:clear')
  ipcMain.handle('cookie:clear', async () => {
    const current = getSettings()
    store.set('settings', { ...current, canvasSessionCookie: '' })
    await runSync(callbacks)
    return true
  })

  // ── Courses ───────────────────────────────────────────────────────────────
  ipcMain.removeHandler('courses:get')
  ipcMain.handle('courses:get', () => store.get('courses') as Course[])
  ipcMain.removeHandler('courses:save')
  ipcMain.handle('courses:save', (_event, courses: Course[]) => {
    store.set('courses', courses)
    return courses
  })

  // ── Completed IDs ─────────────────────────────────────────────────────────
  ipcMain.removeHandler('completed:get')
  ipcMain.handle('completed:get', () => store.get('completedIds') as string[])
  ipcMain.removeHandler('completed:toggle')
  ipcMain.handle('completed:toggle', (_event, id: string) => {
    const ids = store.get('completedIds') as string[]
    const updated = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
    store.set('completedIds', updated)
    rescheduleNotifications(assignments, getSettings().notificationLeadTimes, new Set(updated))
    return updated
  })

  // ── Personal tasks ────────────────────────────────────────────────────────
  ipcMain.removeHandler('tasks:get')
  ipcMain.handle('tasks:get', () => store.get('personalTasks') as PersonalTask[])
  ipcMain.removeHandler('tasks:save')
  ipcMain.handle('tasks:save', (_event, tasks: PersonalTask[]) => {
    store.set('personalTasks', tasks)
    rescheduleNotifications(assignments, getSettings().notificationLeadTimes, new Set(store.get('completedIds') as string[]))
    return tasks
  })

  // ── CSE site URLs ─────────────────────────────────────────────────────────
  ipcMain.removeHandler('cse-sites:get')
  ipcMain.handle('cse-sites:get', () => store.get('cseSiteUrls') as CseSiteEntry[])
  ipcMain.removeHandler('cse-sites:save')
  ipcMain.handle('cse-sites:save', async (_event, entries: CseSiteEntry[]) => {
    store.set('cseSiteUrls', entries)
    await runSync(callbacks)
    return entries
  })

  // ── Time estimates ────────────────────────────────────────────────────────
  ipcMain.removeHandler('estimates:get')
  ipcMain.handle('estimates:get', () => store.get('estimates') as Record<string, number>)
  ipcMain.removeHandler('estimates:set')
  ipcMain.handle('estimates:set', (_event, id: string, minutes: number | null) => {
    const current = store.get('estimates') as Record<string, number>
    if (minutes === null) {
      const rest = { ...current }
      delete rest[id]
      store.set('estimates', rest)
      return rest
    }
    const updated = { ...current, [id]: minutes }
    store.set('estimates', updated)
    return updated
  })

  // ── Snooze ────────────────────────────────────────────────────────────────
  ipcMain.removeHandler('snooze:get')
  ipcMain.handle('snooze:get', () => store.get('snoozeState') as Record<string, string>)
  ipcMain.removeHandler('snooze:set')
  ipcMain.handle('snooze:set', (_event, id: string, until: string) => {
    const current = store.get('snoozeState') as Record<string, string>
    const updated = { ...current, [id]: until }
    store.set('snoozeState', updated)
    return updated
  })
  ipcMain.removeHandler('snooze:clear')
  ipcMain.handle('snooze:clear', (_event, id: string) => {
    const current = store.get('snoozeState') as Record<string, string>
    const rest = { ...current }
    delete rest[id]
    store.set('snoozeState', rest)
    return rest
  })
  ipcMain.removeHandler('snooze:clear-next-sync')
  ipcMain.handle('snooze:clear-next-sync', () => {
    const current = store.get('snoozeState') as Record<string, string>
    const cleaned = Object.fromEntries(Object.entries(current).filter(([, v]) => v !== 'next-sync'))
    store.set('snoozeState', cleaned)
    return cleaned
  })

  // ── Notifications ─────────────────────────────────────────────────────────
  ipcMain.removeHandler('notifications:request')
  ipcMain.handle('notifications:request', () => { requestNotificationPermission(); return true })

  // ── App paths ─────────────────────────────────────────────────────────────
  ipcMain.removeHandler('app:resources-path')
  ipcMain.handle('app:resources-path', () => ({ resourcesPath: process.resourcesPath, isDev: !!process.env.VITE_DEV_SERVER_URL }))

  // ── Onboarding ────────────────────────────────────────────────────────────
  ipcMain.removeHandler('onboarding:complete')
  ipcMain.handle('onboarding:complete', async () => {
    const current = getSettings()
    store.set('settings', { ...current, onboardingComplete: true })
    callbacks.closeOnboarding()
    callbacks.showPanel()
    await runSync(callbacks)
    startSyncTimer(callbacks)
    scheduleDailyDigest(getSettings().dailyDigest)
    return true
  })

  ipcMain.removeHandler('onboarding:reopen')
  ipcMain.handle('onboarding:reopen', async () => {
    const current = getSettings()
    store.set('settings', { ...current, onboardingComplete: false })
    callbacks.hidePanel()
    callbacks.openOnboarding()
    return true
  })

  // Treat onboarding as complete only if the user has actually configured a data source.
  // This prevents skipping onboarding when settings exist but credentials were removed.
  const settings = getSettings()
  const hasConfigured = !!getToken() || !!settings.canvasIcalUrl || !!settings.canvasSessionCookie
  const isOnboardingComplete = settings.onboardingComplete && hasConfigured

  if (isOnboardingComplete) {
    runSync(callbacks)
    startSyncTimer(callbacks)
    scheduleDailyDigest(settings.dailyDigest)
  }

  return {
    triggerSync: () => runSync(callbacks),
    isOnboardingComplete,
    onWake: () => {},
    triggerReschedule: () => {
      const settings = getSettings()
      const completedIds = new Set(store.get('completedIds') as string[])
      rescheduleNotifications(assignments, settings.notificationLeadTimes, completedIds)
    },
  }
}
