import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, nativeTheme, screen, powerMonitor } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { setupIPC, isOnboarded } from './ipc'

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}
app.on('second-instance', () => {
  if (panel) {
    showPanel()
    panel.focus()
  }
})

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let tray: Tray | null = null
let panel: BrowserWindow | null = null
let backdrop: BrowserWindow | null = null
let onboardingWin: BrowserWindow | null = null
let panelBlocked = false
let hideOnBlur = false
let searchActive = false
let lastShownAt = 0
const IDLE_RECREATE_THRESHOLD_MS = 30 * 60 * 1000

// ── Tray icon ─────────────────────────────────────────────────────────────────

function makeTrayIcon(): Electron.NativeImage {
  const img = nativeImage.createFromPath(
    path.join(process.env.APP_ROOT, 'resources/icons/tray-icon.png'),
  )
  img.setTemplateImage(true)
  return img.resize({ width: 25, height: 25 })
}

function updateTrayBadge(): void {
  if (!tray) return
  tray.setImage(makeTrayIcon())
}

// ── Windows ───────────────────────────────────────────────────────────────────

function createPanel(): void {
  panel = new BrowserWindow({
    width: 340,
    height: 520,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    panel.loadURL(VITE_DEV_SERVER_URL)
  } else {
    panel.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  panel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  panel.on('blur', () => {
    if (!hideOnBlur) return
    hideOnBlur = false
    panel?.hide()
  })

  panel.webContents.on('before-input-event', (_ev, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape' && !searchActive) {
      hideOnBlur = true
      destroyBackdrop()
      panel?.hide()
    }
  })
  panel.on('hide', () => destroyBackdrop())
}

function destroyBackdrop(): void {
  backdrop?.destroy()
  backdrop = null
}

function createBackdrop(): void {
  destroyBackdrop()
  if (!panel) return
  const display = screen.getDisplayNearestPoint(panel.getBounds())
  backdrop = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  backdrop.setAlwaysOnTop(true, 'pop-up-menu', 0)
  backdrop.setHiddenInMissionControl(true)
  backdrop.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  backdrop.loadURL('data:text/html,<body style="margin:0;width:100vw;height:100vh;background:rgba(0,0,0,0.01)" onmousedown="location.href=\'backdrop://hide\'"></body>')
  backdrop.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('backdrop://')) {
      e.preventDefault()
      panel?.hide()
      destroyBackdrop()
    }
  })
}

function openOnboardingWindow(): void {
  if (onboardingWin) { onboardingWin.close(); onboardingWin = null }
  createOnboardingWindow()
}

function createOnboardingWindow(): void {
  onboardingWin = new BrowserWindow({
    width: 560,
    height: 600,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: false,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    onboardingWin.loadURL(VITE_DEV_SERVER_URL + '#onboarding')
    onboardingWin.once('ready-to-show', () => {
      if (process.platform === 'darwin') app.dock.show()
      onboardingWin?.show()
      onboardingWin?.center()
      onboardingWin?.focus()
    })
  } else {
    onboardingWin.loadFile(path.join(RENDERER_DIST, 'index.html'), { hash: 'onboarding' })
    onboardingWin.once('ready-to-show', () => {
      if (process.platform === 'darwin') app.dock.show()
      onboardingWin?.show()
      onboardingWin?.center()
      onboardingWin?.focus()
    })
  }

  onboardingWin.on('closed', () => { onboardingWin = null; panelBlocked = false; if (process.platform === 'darwin') app.dock.hide() })
}

// ── Panel positioning ─────────────────────────────────────────────────────────

function maybeRecreatePanel(): boolean {
  if (!panel) {
    createPanel()
    return true
  }
  const idleMs = Date.now() - lastShownAt
  console.log(`[panel] showPanel: idleMs=${idleMs}, willRecreate=${lastShownAt > 0 && idleMs > IDLE_RECREATE_THRESHOLD_MS}`)
  if (lastShownAt > 0 && idleMs > IDLE_RECREATE_THRESHOLD_MS) {
    destroyBackdrop()
    try {
      panel.removeAllListeners()
      panel.destroy()
    } catch { /* destroyed already */ }
    panel = null
    createPanel()
    return true
  }
  return false
}

function showPanel(): void {
  if (panelBlocked || onboardingWin) return
  const wasRecreated = maybeRecreatePanel()
  if (!panel || !tray) return

  const positionAndShow = () => {
    if (!panel || !tray) return

    const trayBounds = tray.getBounds()

    if (trayBounds.width === 0) {
      const { width } = screen.getPrimaryDisplay().workAreaSize
      panel.setPosition(width - 360, 30)
    } else {
      const { width: pw } = panel.getBounds()
      const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
      const db = display.bounds

      let x = Math.round(trayBounds.x + trayBounds.width / 2 - pw / 2)
      const y = trayBounds.y + trayBounds.height + 4

      if (x + pw > db.x + db.width) x = db.x + db.width - pw
      if (x < db.x) x = db.x

      panel.setPosition(x, y, false)
    }

    panel.setAlwaysOnTop(true, 'pop-up-menu')
    panel.moveTop()
    panel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    panel.show()
    createBackdrop()
    panel.setAlwaysOnTop(true, 'pop-up-menu', 1)
    panel.moveTop()
    hideOnBlur = false
    panel.focus()
    panel.webContents.send('panel:shown')
    lastShownAt = Date.now()
  }

  if (wasRecreated) {
    panel.once('ready-to-show', positionAndShow)
  } else {
    positionAndShow()
  }
}

function togglePanel(): void {
  if (!panel) return
  if (panel.isVisible()) {
    destroyBackdrop()
    hideOnBlur = true
    panel.hide()
  } else {
    showPanel()
  }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock.hide()
    app.dock.setIcon(nativeImage.createFromPath(
      path.join(process.env.APP_ROOT, 'resources/icons/app-icon-dark.png'),
    ))
  }

  tray = new Tray(makeTrayIcon())
  tray.setToolTip('Canvas Dashboard')

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Canvas Companion', enabled: false },
    { type: 'separator' },
    { label: 'Open Dashboard', click: () => showPanel() },
    { label: 'Preferences', click: () => showPanel() },
    { type: 'separator' },
    { label: 'Quit Canvas Companion', click: () => app.quit() },
  ])

  tray.on('click', () => togglePanel())
  tray.on('right-click', () => {
    tray!.popUpContextMenu(contextMenu)
  })

  // Regenerate icon when menu bar appearance changes
  nativeTheme.on('updated', updateTrayBadge)

  createPanel()

  ipcMain.on('search:active', (_event, active: boolean) => { searchActive = active })

  ipcMain.on('panel:resize', (_event, width: number, height: number) => {
    if (!panel || !tray) return
    panel.setSize(width, height)

    const trayBounds = tray.getBounds()
    const panelBounds = panel.getBounds()
    const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
    const db = display.bounds

    let x = Math.round(trayBounds.x + trayBounds.width / 2 - panelBounds.width / 2)
    const y = trayBounds.y + trayBounds.height + 4

    if (x + panelBounds.width > db.x + db.width) x = db.x + db.width - panelBounds.width
    if (x < db.x) x = db.x

    panel.setPosition(x, y)
  })

  const { triggerSync, isOnboardingComplete, onWake, triggerReschedule } = setupIPC(() => panel, {
    showPanel: () => showPanel(),
    closeOnboarding: () => { panelBlocked = false; onboardingWin?.close(); onboardingWin = null },
    openOnboarding: () => openOnboardingWindow(),
    hidePanel: () => { panel?.hide(); panelBlocked = true },
    onBadgeUpdate: () => {},
  })

  if (!isOnboardingComplete) {
    openOnboardingWindow()
  }

  powerMonitor.on('resume', () => {
    if (isOnboarded()) {
      triggerSync()
      triggerReschedule()
    }
    onWake()
    if (!panelBlocked && !onboardingWin) panel?.webContents.send('panel:shown')
  })

  app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true })
})

app.on('window-all-closed', () => { /* intentionally empty — keep alive in menu bar */ })
