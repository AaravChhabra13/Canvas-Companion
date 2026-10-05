import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { EyeOff, Bell, Clock, Plug } from 'lucide-react'
import { Toggle } from './Toggle'
import type { Course, CseSiteEntry, Settings } from '../../shared/types'
import { isValidIcalUrl, ICAL_URL_ERROR } from '../../lib/icalUrl'

export function SettingsPanel({
  settings, hideOldOverdue, onToggleHideOldOverdue, onSave,
}: {
  settings: Settings
  hideOldOverdue: boolean
  onToggleHideOldOverdue: (v: boolean) => void
  onSave: (s: Partial<Settings>, c?: Course[]) => Promise<void>
}) {
  const [baseUrl, setBaseUrl] = useState(settings.canvasBaseUrl)
  const [icalUrl, setIcalUrl] = useState(settings.canvasIcalUrl)
  const [icalError, setIcalError] = useState('')
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
          <textarea value={icalUrl} onChange={e => { setIcalUrl(e.target.value); setIcalError('') }}
            onBlur={() => {
              const trimmed = icalUrl.trim()
              // Empty is allowed, it clears the feed
              if (trimmed && !isValidIcalUrl(trimmed)) {
                setIcalError(ICAL_URL_ERROR)
                return
              }
              autoSave({ canvasIcalUrl: trimmed }, true)
            }}
            placeholder="https://canvas.uw.edu/feeds/calendars/user_….ics"
            rows={3} spellCheck={false} className={`${inputCls} resize-none`} />
          {icalError && <p className="text-xs" style={{ color: 'hsl(var(--danger))' }}>{icalError}</p>}
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
