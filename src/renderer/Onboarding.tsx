import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Calendar, Key, Shield, ArrowLeft, Bell } from 'lucide-react'
import type { Course, CseSiteEntry } from '../shared/types'

// ── Types ─────────────────────────────────────────────────────────────────────

type Screen =
  | 'welcome'
  | 'choose'
  | 'guide-ical' | 'guide-token' | 'guide-cookie'
  | 'input-ical' | 'input-token' | 'input-cookie'
  | 'cse-sites'
  | 'daily-digest'
  | 'syncing'

// Progress step for dots (1–6)
const STEP: Record<Screen, number> = {
  welcome: 1,
  choose: 2,
  'guide-ical': 3, 'guide-token': 3, 'guide-cookie': 3,
  'input-ical': 3, 'input-token': 3, 'input-cookie': 3,
  'cse-sites': 4,
  'daily-digest': 5,
  syncing: 6,
}

const TOTAL_STEPS = 6

// ── Animation ─────────────────────────────────────────────────────────────────

const variants = {
  enter: (dir: number) => ({ x: dir * 36, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -36, opacity: 0 }),
}
const transition = { duration: 0.2, ease: 'easeOut' as const }

// ── Shared UI ─────────────────────────────────────────────────────────────────

function ProgressDots({ screen }: { screen: Screen }) {
  const current = STEP[screen]
  return (
    <div className="flex items-center justify-center gap-1.5 mb-6">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map(n => (
        <div
          key={n}
          className="rounded-full transition-all duration-200"
          style={{
            width: n === current ? 20 : 6,
            height: 6,
            background: n === current ? 'hsl(var(--primary))' : n < current ? 'hsl(var(--primary) / 0.4)' : 'hsl(0 0% 100% / 0.12)',
          }}
        />
      ))}
    </div>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-5 self-start"
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      Back
    </button>
  )
}

const inputCls = 'w-full glass-inset rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/50'

function PrimaryButton({
  onClick, disabled, children,
}: { onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-2.5 rounded-xl text-sm font-semibold text-primary-foreground disabled:opacity-40 transition-opacity hover:opacity-90"
      style={{ background: 'var(--gradient-primary)', boxShadow: disabled ? 'none' : 'var(--shadow-glow)' }}
    >
      {children}
    </button>
  )
}

function SecondaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
    >
      {children}
    </button>
  )
}

function SmallButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 glass-inset transition-colors"
    >
      {children}
    </button>
  )
}

function WarningBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl px-4 py-3 text-xs leading-relaxed" style={{ background: 'hsl(35 80% 55% / 0.12)', border: '1px solid hsl(35 80% 55% / 0.25)', color: 'hsl(35 80% 70%)' }}>
      {children}
    </div>
  )
}

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="flex flex-col gap-2.5 w-full">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-3">
          <span
            className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5"
            style={{ background: 'hsl(var(--primary) / 0.2)', color: 'hsl(var(--primary))' }}
          >
            {i + 1}
          </span>
          <span className="text-sm text-foreground/80 leading-relaxed">{s}</span>
        </li>
      ))}
    </ol>
  )
}

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: (v: boolean) => void }) {
  return (
    <button
      role="switch" aria-checked={enabled}
      onClick={() => onToggle(!enabled)}
      style={{
        flexShrink: 0,
        width: 48,
        height: 28,
        background: enabled ? 'hsl(212 90% 60%)' : 'hsl(0 0% 100% / 0.15)',
      }}
      className="relative rounded-full transition-colors overflow-hidden"
    >
      <span
        className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Onboarding() {
  const [screen, setScreen] = useState<Screen>('welcome')
  const [dir, setDir] = useState(1)                // 1 = forward, -1 = back

  const [iconSrc, setIconSrc] = useState('')

  // iCal
  const [icalUrl, setIcalUrl] = useState('')
  // Token
  const [tokenUrl, setTokenUrl] = useState('https://canvas.uw.edu')
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [tokenStatus, setTokenStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [tokenError, setTokenError] = useState('')
  // Cookie
  const [cookie, setCookie] = useState('')
  const [showCookie, setShowCookie] = useState(false)
  // Connect status (shared)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')
  // CSE sites
  const [courses, setCourses] = useState<Course[]>([])
  const [cseSites, setCseSites] = useState<CseSiteEntry[]>([])
  const [newCseUrl, setNewCseUrl] = useState('')
  const [newCseCourse, setNewCseCourse] = useState('')
  // Daily digest
  const [digestEnabled, setDigestEnabled] = useState(false)
  const [digestHour, setDigestHour] = useState(8)   // 1–12
  const [digestAmPm, setDigestAmPm] = useState<'AM' | 'PM'>('AM')
  // Sync result
  const [syncCount, setSyncCount] = useState<number | null>(null)
  const [syncError, setSyncError] = useState('')
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const iconFile = isDark ? 'app-icon-dark.png' : 'app-icon-light.png'

    if (window.ipcRenderer) {
      window.ipcRenderer.invoke('app:resources-path').then(({ resourcesPath, isDev }: { resourcesPath: string; isDev: boolean }) => {
        setIconSrc(isDev ? `/icons/${iconFile}` : `file://${resourcesPath}/icons/${iconFile}`)
      }).catch(() => {
        setIconSrc(`/icons/${iconFile}`)
      })
    } else {
      setIconSrc(`/icons/${iconFile}`)
    }
  }, [])

  // ── Navigation ───────────────────────────────────────────────────────────

  function go(to: Screen, direction: 1 | -1 = 1) {
    setDir(direction)
    setConnectError('')
    setScreen(to)
  }

  // ── Connect handlers ─────────────────────────────────────────────────────

  async function connectIcal() {
    if (!icalUrl.trim()) return
    setConnecting(true)
    setConnectError('')
    try {
      await window.ipcRenderer.invoke('settings:set', {
        canvasIcalUrl: icalUrl.trim(),
        canvasBaseUrl: 'https://canvas.uw.edu',
      })
      const loaded = await window.ipcRenderer.invoke('courses:get') as Course[]
      setCourses(loaded)
      go('cse-sites')
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : 'Failed to connect. Check the URL and try again.')
    } finally {
      setConnecting(false)
    }
  }

  async function connectToken() {
    if (!token.trim()) return
    setTokenStatus('testing')
    setTokenError('')
    const valid = await window.ipcRenderer.invoke('token:validate', tokenUrl.trim(), token.trim()) as boolean
    if (!valid) {
      setTokenStatus('error')
      setTokenError('Invalid token or wrong Canvas URL — check both and try again.')
      return
    }
    setConnecting(true)
    try {
      await window.ipcRenderer.invoke('token:save', token.trim())
      await window.ipcRenderer.invoke('settings:set', { canvasBaseUrl: tokenUrl.trim() })
      await window.ipcRenderer.invoke('sync:run-and-wait')
      const loaded = await window.ipcRenderer.invoke('courses:get') as Course[]
      setCourses(loaded)
      setTokenStatus('ok')
      go('cse-sites')
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : 'Failed to connect.')
      setTokenStatus('idle')
    } finally {
      setConnecting(false)
    }
  }

  async function connectCookie() {
    if (!cookie.trim()) return
    setConnecting(true)
    setConnectError('')
    try {
      await window.ipcRenderer.invoke('cookie:save', cookie.trim())
      const loaded = await window.ipcRenderer.invoke('courses:get') as Course[]
      setCourses(loaded)
      go('cse-sites')
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : 'Failed to connect.')
    } finally {
      setConnecting(false)
    }
  }

  // ── CSE site helpers ─────────────────────────────────────────────────────

  function addCseSite() {
    const url = newCseUrl.trim()
    const courseName = newCseCourse.trim()
    if (!url || !courseName) return
    setCseSites(prev => [...prev, { url, courseName }])
    setNewCseUrl('')
    setNewCseCourse('')
  }

  function removeCseSite(i: number) {
    setCseSites(prev => prev.filter((_, j) => j !== i))
  }

  async function finishCseSites() {
    if (cseSites.length > 0) {
      await window.ipcRenderer.invoke('cse-sites:save', cseSites)
    }
    go('daily-digest')
  }

  // ── Daily digest helpers ─────────────────────────────────────────────────

  async function saveDigestAndContinue() {
    const actualHour = digestAmPm === 'AM'
      ? (digestHour === 12 ? 0 : digestHour)
      : (digestHour === 12 ? 12 : digestHour + 12)
    await window.ipcRenderer.invoke('settings:set', {
      dailyDigest: { enabled: digestEnabled, hour: actualHour, minute: 0 },
    })
    runFinalSync()
  }

  // ── Final sync ───────────────────────────────────────────────────────────

  async function runFinalSync() {
    go('syncing')
    setSyncing(true)
    setSyncError('')
    const result = await window.ipcRenderer.invoke('sync:run-and-wait') as { count: number; error?: string }
    setSyncing(false)
    if (result.error) {
      setSyncError(result.error)
    } else {
      setSyncCount(result.count)
    }
  }

  async function handleFinish() {
    await window.ipcRenderer.invoke('onboarding:complete')
  }

  // ── Render ───────────────────────────────────────────────────────────────


  return (
    <div className="w-screen h-screen aurora" style={{ WebkitUserSelect: 'none', userSelect: 'none' }}>
      <div className="glass w-full h-full flex flex-col overflow-hidden">
        {/* Drag handle titlebar */}
        <div style={{ height: 28, flexShrink: 0, WebkitAppRegion: 'drag' } as React.CSSProperties} />

        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div
              key={screen}
              custom={dir}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={transition}
              className="flex flex-col px-10 pb-8 min-h-full"
            >
              <ProgressDots screen={screen} />

              {screen === 'welcome' && (
                <WelcomeScreen icon={iconSrc} onNext={() => go('choose')} />
              )}

              {screen === 'choose' && (
                <ChooseScreen
                  onSetup={method => go(`input-${method}`)}
                  onGuide={method => go(`guide-${method}`)}
                />
              )}

              {screen === 'guide-ical' && (
                <GuideIcal onBack={() => go('choose', -1)} onSetup={() => go('input-ical')} />
              )}

              {screen === 'guide-token' && (
                <GuideToken onBack={() => go('choose', -1)} onSetup={() => go('input-token')} />
              )}

              {screen === 'guide-cookie' && (
                <GuideCookie onBack={() => go('choose', -1)} onSetup={() => go('input-cookie')} />
              )}

              {screen === 'input-ical' && (
                <InputIcal
                  url={icalUrl} setUrl={setIcalUrl}
                  connecting={connecting} error={connectError}
                  onBack={() => go('choose', -1)} onConnect={connectIcal}
                />
              )}

              {screen === 'input-token' && (
                <InputToken
                  baseUrl={tokenUrl} setBaseUrl={setTokenUrl}
                  token={token} setToken={v => { setToken(v); setTokenStatus('idle') }}
                  showToken={showToken} setShowToken={setShowToken}
                  status={tokenStatus} error={tokenError}
                  connecting={connecting} connectError={connectError}
                  onBack={() => go('choose', -1)} onConnect={connectToken}
                />
              )}

              {screen === 'input-cookie' && (
                <InputCookie
                  cookie={cookie} setCookie={setCookie}
                  showCookie={showCookie} setShowCookie={setShowCookie}
                  connecting={connecting} error={connectError}
                  onBack={() => go('choose', -1)} onConnect={connectCookie}
                />
              )}

              {screen === 'cse-sites' && (
                <CseSitesScreen
                  courses={courses}
                  sites={cseSites}
                  newUrl={newCseUrl} setNewUrl={setNewCseUrl}
                  newCourse={newCseCourse} setNewCourse={setNewCseCourse}
                  onAdd={addCseSite} onRemove={removeCseSite}
                  onSkip={() => go('daily-digest')}
                  onContinue={finishCseSites}
                />
              )}

              {screen === 'daily-digest' && (
                <DailyDigestScreen
                  enabled={digestEnabled} setEnabled={setDigestEnabled}
                  hour={digestHour} setHour={setDigestHour}
                  amPm={digestAmPm} setAmPm={setDigestAmPm}
                  onBack={() => go('cse-sites', -1)}
                  onSkip={runFinalSync}
                  onContinue={saveDigestAndContinue}
                />
              )}

              {screen === 'syncing' && (
                <SyncingScreen
                  syncing={syncing} count={syncCount} error={syncError}
                  onRetry={runFinalSync} onFinish={handleFinish}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

// ── Screen components ─────────────────────────────────────────────────────────

function WelcomeScreen({ icon, onNext }: { icon: string; onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-4 pt-4">
      {icon ? (
        <img src={icon} alt="Canvas Companion" className="w-20 h-20 rounded-2xl" />
      ) : (
        <div className="w-20 h-20 rounded-2xl glass-inset" />
      )}
      <div>
        <h1 className="text-2xl font-bold mb-1">Canvas Companion</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your assignments, always one click away
        </p>
      </div>
      <div className="w-full mt-2">
        <PrimaryButton onClick={onNext}>Get Started</PrimaryButton>
      </div>
    </div>
  )
}

function ChooseScreen({
  onSetup, onGuide,
}: {
  onSetup: (m: 'ical' | 'token' | 'cookie') => void
  onGuide: (m: 'ical' | 'token' | 'cookie') => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-center mb-1">
        How do you want to connect to Canvas?
      </h2>
      <MethodCard
        icon={<Calendar className="w-5 h-5" />}
        title="Calendar Feed"
        subtitle="Works everywhere. No login required."
        badge="Recommended"
        badgeColor="hsl(160 55% 50%)"
        badgeBg="hsl(160 55% 50% / 0.12)"
        onSetup={() => onSetup('ical')}
        onGuide={() => onGuide('ical')}
      />
      <MethodCard
        icon={<Key className="w-5 h-5" />}
        title="API Token"
        subtitle="Best experience. More assignment details."
        badge="Not available at UW"
        badgeColor="hsl(35 80% 65%)"
        badgeBg="hsl(35 80% 55% / 0.12)"
        onSetup={() => onSetup('token')}
        onGuide={() => onGuide('token')}
      />
      <MethodCard
        icon={<Shield className="w-5 h-5" />}
        title="Session Cookie"
        subtitle="For UW students. A few extra steps."
        badge="UW Students"
        badgeColor="hsl(212 90% 65%)"
        badgeBg="hsl(212 90% 60% / 0.12)"
        onSetup={() => onSetup('cookie')}
        onGuide={() => onGuide('cookie')}
      />
    </div>
  )
}

function MethodCard({
  icon, title, subtitle, badge, badgeColor, badgeBg, onSetup, onGuide,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  badge: string
  badgeColor: string
  badgeBg: string
  onSetup: () => void
  onGuide: () => void
}) {
  return (
    <div className="glass-inset rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))' }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{title}</span>
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{ color: badgeColor, background: badgeBg }}
            >
              {badge}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onSetup}
          className="flex-1 py-2 rounded-xl text-xs font-semibold text-primary-foreground"
          style={{ background: 'var(--gradient-primary)' }}
        >
          Set up
        </button>
        <SmallButton onClick={onGuide}>How does this work?</SmallButton>
      </div>
    </div>
  )
}

function GuideIcal({ onBack, onSetup }: { onBack: () => void; onSetup: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={onBack} />
      <h2 className="text-lg font-semibold">Getting your Calendar Feed URL</h2>
      <StepList steps={[
        'Log into Canvas in your browser',
        'Click Calendar in the left sidebar',
        'Scroll to the very bottom of the calendar page',
        'Click Calendar Feed',
        'Copy the URL that appears',
      ]} />
      <PrimaryButton onClick={onSetup}>Got it, set up Calendar Feed</PrimaryButton>
    </div>
  )
}

function GuideToken({ onBack, onSetup }: { onBack: () => void; onSetup: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={onBack} />
      <h2 className="text-lg font-semibold">Getting your API Token</h2>
      <StepList steps={[
        'Log into Canvas',
        'Click your profile picture in the top right',
        'Click Settings',
        'Scroll down to Approved Integrations',
        'Click New Access Token',
        'Name it Canvas Companion and click Generate',
        'Copy the token — you only see it once',
      ]} />
      <WarningBox>
        Check if your institution allows student PATs — many universities restrict this. Use iCal or Session Cookies instead.
      </WarningBox>
      <PrimaryButton onClick={onSetup}>Got it, set up API Token</PrimaryButton>
    </div>
  )
}

function GuideCookie({ onBack, onSetup }: { onBack: () => void; onSetup: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={onBack} />
      <h2 className="text-lg font-semibold">Getting your Session Cookie</h2>
      <StepList steps={[
        'Log into Canvas in Chrome',
        'Press Cmd+Option+I to open Developer Tools',
        'Click the Network tab at the top',
        'Click any link on Canvas to generate requests',
        'Click the first request in the list (canvas.uw.edu)',
        'Click Headers on the right panel',
        'Scroll to Request Headers',
        'Find the Cookie row and copy the entire long value',
      ]} />
      <WarningBox>
        This cookie expires when you log out of Canvas. Re-paste it in Settings if assignments stop loading.
      </WarningBox>
      <PrimaryButton onClick={onSetup}>Got it, set up Session Cookie</PrimaryButton>
    </div>
  )
}

function InputIcal({
  url, setUrl, connecting, error, onBack, onConnect,
}: {
  url: string; setUrl: (v: string) => void
  connecting: boolean; error: string
  onBack: () => void; onConnect: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={onBack} />
      <h2 className="text-lg font-semibold">Paste your Calendar Feed URL</h2>
      <input
        type="url" value={url} onChange={e => setUrl(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onConnect()}
        placeholder="https://canvas.uw.edu/feeds/calendars/..."
        spellCheck={false} className={inputCls}
        style={{ WebkitUserSelect: 'text', userSelect: 'text' } as React.CSSProperties}
      />
      {error && <p className="text-xs" style={{ color: 'hsl(var(--danger))' }}>{error}</p>}
      <PrimaryButton onClick={onConnect} disabled={!url.trim() || connecting}>
        {connecting ? 'Connecting…' : 'Connect'}
      </PrimaryButton>
    </div>
  )
}

function InputToken({
  baseUrl, setBaseUrl, token, setToken, showToken, setShowToken,
  status, error, connecting, connectError, onBack, onConnect,
}: {
  baseUrl: string; setBaseUrl: (v: string) => void
  token: string; setToken: (v: string) => void
  showToken: boolean; setShowToken: (v: boolean) => void
  status: 'idle' | 'testing' | 'ok' | 'error'; error: string
  connecting: boolean; connectError: string
  onBack: () => void; onConnect: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={onBack} />
      <h2 className="text-lg font-semibold">Paste your API Token</h2>
      <p className="text-xs text-muted-foreground">
        Before generating a token, check whether your institution's Canvas allows student Personal Access Tokens — some universities restrict or require faculty sponsorship for API access.
      </p>
      <input
        type="url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
        placeholder="https://canvas.uw.edu" spellCheck={false} className={inputCls}
        style={{ WebkitUserSelect: 'text', userSelect: 'text' } as React.CSSProperties}
      />
      <div className="relative">
        <input
          type={showToken ? 'text' : 'password'}
          value={token} onChange={e => setToken(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onConnect()}
          placeholder="Paste your token here" spellCheck={false}
          className={`${inputCls} pr-14`}
          style={{ WebkitUserSelect: 'text', userSelect: 'text' } as React.CSSProperties}
        />
        <button
          onClick={() => setShowToken(!showToken)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {showToken ? 'Hide' : 'Show'}
        </button>
      </div>
      {status === 'ok' && <p className="text-xs" style={{ color: 'hsl(var(--success))' }}>✓ Token verified</p>}
      {status === 'error' && <p className="text-xs" style={{ color: 'hsl(var(--danger))' }}>{error}</p>}
      {connectError && <p className="text-xs" style={{ color: 'hsl(var(--danger))' }}>{connectError}</p>}
      <PrimaryButton onClick={onConnect} disabled={!token.trim() || status === 'testing' || connecting}>
        {status === 'testing' || connecting ? 'Verifying…' : 'Connect'}
      </PrimaryButton>
    </div>
  )
}

function InputCookie({
  cookie, setCookie, showCookie, setShowCookie, connecting, error, onBack, onConnect,
}: {
  cookie: string; setCookie: (v: string) => void
  showCookie: boolean; setShowCookie: (v: boolean) => void
  connecting: boolean; error: string
  onBack: () => void; onConnect: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={onBack} />
      <h2 className="text-lg font-semibold">Paste your Session Cookie</h2>
      <div className="relative">
        <textarea
          value={cookie} onChange={e => setCookie(e.target.value)}
          placeholder="Paste the Cookie header value here"
          rows={4} spellCheck={false}
          className={`${inputCls} resize-none pr-14`}
          style={{ WebkitUserSelect: 'text', userSelect: 'text', fontFamily: 'monospace', fontSize: 11 } as React.CSSProperties}
        />
        <button
          onClick={() => setShowCookie(!showCookie)}
          className="absolute right-3 top-3 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {showCookie ? 'Hide' : 'Show'}
        </button>
        {!showCookie && cookie && (
          <div
            className="absolute inset-0 rounded-xl pointer-events-none"
            style={{ backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' } as React.CSSProperties}
          />
        )}
      </div>
      <WarningBox>
        This cookie expires when you log out of Canvas. Re-paste it in Settings if assignments stop loading.
      </WarningBox>
      {error && <p className="text-xs" style={{ color: 'hsl(var(--danger))' }}>{error}</p>}
      <PrimaryButton onClick={onConnect} disabled={!cookie.trim() || connecting}>
        {connecting ? 'Connecting…' : 'Connect'}
      </PrimaryButton>
    </div>
  )
}

function CseSitesScreen({
  courses, sites, newUrl, setNewUrl, newCourse, setNewCourse,
  onAdd, onRemove, onSkip, onContinue,
}: {
  courses: Course[]
  sites: CseSiteEntry[]
  newUrl: string; setNewUrl: (v: string) => void
  newCourse: string; setNewCourse: (v: string) => void
  onAdd: () => void; onRemove: (i: number) => void
  onSkip: () => void; onContinue: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold mb-1">Do you have any UW CSE courses?</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          CSE courses often have their own websites with assignments not fully listed on Canvas.
          Add them for complete tracking.
        </p>
      </div>

      {sites.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {sites.map((s, i) => (
            <div key={i} className="glass-inset rounded-xl px-3 py-2 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{s.courseName}</div>
                <div className="text-[10px] text-muted-foreground truncate">{s.url}</div>
              </div>
              <button
                onClick={() => onRemove(i)}
                className="text-[10px] px-2 py-1 rounded-lg hover:bg-white/5 shrink-0"
                style={{ color: 'hsl(var(--danger))' }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        type="url" value={newUrl} onChange={e => setNewUrl(e.target.value)}
        placeholder="https://courses.cs.washington.edu/courses/cse123/26sp/"
        spellCheck={false} className={inputCls}
        style={{ WebkitUserSelect: 'text', userSelect: 'text' } as React.CSSProperties}
      />

      {courses.length > 0 ? (
        <select
          value={newCourse} onChange={e => setNewCourse(e.target.value)}
          className={`${inputCls} appearance-auto`}
        >
          <option value="">Select matching Canvas course…</option>
          {courses.map(c => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
      ) : (
        <input
          type="text" value={newCourse} onChange={e => setNewCourse(e.target.value)}
          placeholder="Course name (e.g. CSE 123)"
          spellCheck={false} className={inputCls}
          onKeyDown={e => e.key === 'Enter' && onAdd()}
          style={{ WebkitUserSelect: 'text', userSelect: 'text' } as React.CSSProperties}
        />
      )}

      <p className="text-[11px] text-muted-foreground -mt-2">
        URL format: courses/cseXXX/YYqq/ — where qq is au/wi/sp/su for your quarter
      </p>

      <button
        onClick={onAdd}
        disabled={!newUrl.trim() || !newCourse.trim()}
        className="block mx-auto px-6 py-2 rounded-full text-xs font-medium text-primary-foreground disabled:opacity-40"
        style={{ background: 'var(--gradient-primary)' }}
      >
        Add Site
      </button>

      <div className="flex flex-col items-center gap-3 mt-8">
        <button
          onClick={onContinue}
          className="w-50 py-2 rounded-xl text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:opacity-80"
          style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--shadow-glow)' }}
        >
          Continue
        </button>
        <button
          onClick={onSkip}
          className="text-xs text-white/50 hover:text-white/70 transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  )
}

function DailyDigestScreen({
  enabled, setEnabled, hour, setHour, amPm, setAmPm, onBack, onSkip, onContinue,
}: {
  enabled: boolean; setEnabled: (v: boolean) => void
  hour: number; setHour: (v: number) => void
  amPm: 'AM' | 'PM'; setAmPm: (v: 'AM' | 'PM') => void
  onBack: () => void; onSkip: () => void; onContinue: () => void
}) {
  const previewLabel = `${hour}:00 ${amPm}`

  return (
    <div className="flex flex-col gap-5">
      <BackButton onClick={onBack} />

      <div className="flex flex-col items-center text-center gap-3">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{ background: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--primary))' }}
        >
          <Bell className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-1">Daily digest notifications</h2>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
            Get a morning summary of what is due today, tomorrow, and any overdue assignments.
          </p>
        </div>
      </div>

      {/* Toggle row */}
      <div className="glass-inset rounded-2xl p-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium">Enable daily digest</div>
          <div className="text-xs text-muted-foreground mt-0.5">Fires once a day at your chosen time</div>
        </div>
        <Toggle enabled={enabled} onToggle={setEnabled} />
      </div>

      {/* Time picker */}
      {enabled && (
        <div className="glass-inset rounded-2xl p-4 flex flex-col gap-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Notify me at</div>
          <div className="flex items-center gap-3">
            <select
              value={hour}
              onChange={e => setHour(Number(e.target.value))}
              className="flex-1 glass-inset rounded-xl px-3 py-2 text-sm text-foreground outline-none"
            >
              {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(h => (
                <option key={h} value={h}>{h}:00</option>
              ))}
            </select>
            <select
              value={amPm}
              onChange={e => setAmPm(e.target.value as 'AM' | 'PM')}
              className="glass-inset rounded-xl px-3 py-2 text-sm text-foreground outline-none"
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
        </div>
      )}

      {/* Notification preview */}
      <div
        className="rounded-2xl p-4 flex flex-col gap-1"
        style={{ background: 'hsl(0 0% 100% / 0.06)', border: '1px solid hsl(0 0% 100% / 0.1)' }}
      >
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          Preview {enabled ? `— fires at ${previewLabel}` : '— disabled'}
        </div>
        <div className="text-xs font-semibold text-foreground">Canvas Companion</div>
        <div className={`text-xs ${enabled ? 'text-foreground/80' : 'text-muted-foreground/50'}`}>
          {enabled ? '3 due today · 2 due tomorrow · 1 overdue' : 'Daily digest is off'}
        </div>
      </div>

      <div className="flex flex-col gap-3 mt-2">
        <PrimaryButton onClick={onContinue}>
          {enabled ? 'Enable & Continue' : 'Continue'}
        </PrimaryButton>
        <SecondaryButton onClick={onSkip}>Skip</SecondaryButton>
      </div>

    </div>
  )
}

function SyncingScreen({
  syncing, count, error, onRetry, onFinish,
}: {
  syncing: boolean
  count: number | null
  error: string
  onRetry: () => void
  onFinish: () => void
}) {
  return (
    <div className="flex flex-col items-center text-center gap-4 pt-6">
      {syncing && (
        <>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary"
          />
          <p className="text-sm text-muted-foreground">Connecting to Canvas…</p>
        </>
      )}
      {!syncing && count !== null && (
        <>
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
            style={{ background: 'hsl(160 55% 50% / 0.15)' }}
          >
            🎉
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-1" style={{ color: 'hsl(var(--success))' }}>
              {count === 0 ? 'All clear!' : `Found ${count} assignment${count !== 1 ? 's' : ''}`}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {count === 0
                ? 'No upcoming assignments right now. Your dashboard is ready.'
                : 'Your dashboard is ready. Click the menu bar icon anytime.'}
            </p>
          </div>
          <div className="w-full">
            <PrimaryButton onClick={onFinish}>Go to Dashboard</PrimaryButton>
          </div>
        </>
      )}
      {!syncing && error && (
        <>
          <div className="text-3xl">⚠️</div>
          <div>
            <h2 className="text-lg font-semibold mb-1">Sync failed</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">{error}</p>
          </div>
          <div className="w-full flex flex-col gap-2">
            <PrimaryButton onClick={onRetry}>Try again</PrimaryButton>
            <SecondaryButton onClick={onFinish}>Go to Dashboard anyway</SecondaryButton>
          </div>
        </>
      )}
    </div>
  )
}
