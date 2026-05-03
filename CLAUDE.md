# Canvas Dashboard Mac

## What this is
A macOS menu bar app called "Canvas Companion" that fetches assignments 
from the Canvas LMS and displays them in a dropdown panel.
NOTE: The app is branded as "Canvas Companion" in the UI but the codebase,
file names, and repo remain "Canvas Dashboard Mac". Do not rename any files.

## PRD
Full product requirements are in canvas_dashboard_PRD.docx in this folder.
Read it to understand what the app should do from a user perspective.

## TRD
Full technical spec is in canvas_dashboard_TRD.docx in this folder.
Read it before making any decisions about architecture or implementation.

## Stack
- Electron 30 + Node.js 20
- React 18 + TypeScript
- Tailwind CSS v4 + Vite
- electron-store, keytar, axios, ical.js, node-cron
- framer-motion, date-fns, lucide-react

## Critical - do not touch these files ever
- vite.config.ts
- package.json (especially do not add or remove the "type" field)
- tsconfig.json

## Critical - do not edit these files ever
- canvas-companion-main/ (reference only, never edit)
- dist-electron/ (compiled output, never read or edit for debugging)

## Important notes
- UW Canvas DOES allow Personal Access Tokens — REST API works for UW students
- REST API is the preferred data source when a token is available
- iCal feed is the fallback when no token is present
- Session cookie GraphQL is the second option for UW students who prefer not to use PAT
- electron-store always needs a name field: new Store({ name: 'app-store' })
- Always fix bugs in source files in electron/ and src/ only
- Tailwind v4 syntax: use @import "tailwindcss" not @tailwind directives
- postcss.config.js must use @tailwindcss/postcss as the plugin
- npm run dev script must stay as just "vite" — vite-plugin-electron launches
  Electron automatically, do not add concurrently or electron . to the dev script
  or two Electron instances will launch simultaneously
- Canvas REST API returns relative URLs like /courses/123/assignments/456
  these must be prepended with canvasBaseUrl before opening externally
- release/ folder must stay in .gitignore — DMG files are too large for GitHub

## Completed phases
- Phase 1 COMPLETE — iCal feed fetch, urgency bucketing, basic panel UI
- Phase 2 COMPLETE — onboarding flow, course colors, wake sync, notifications
- Phase 3 COMPLETE — dark/light mode, mark as done, menu bar badge,
  frosted glass, personal tasks, course filter tabs, hide old overdue
- Phase 3.1 COMPLETE — full liquid glass UI/UX upgrade, aurora background,
  animated assignment rows, course color coding, overdue/today color labels,
  clear overdue button, settings as animated page, course drill-down
- Phase 4.1 COMPLETE — Canvas GraphQL API using session cookie, falls back to iCal
- Phase 4.1.1 COMPLETE — UW CSE course site scraper, merges with Canvas assignments
- Phase 4.2 COMPLETE — guided onboarding with setup guides for all three methods
- Phase 4.2.1 COMPLETE — back to onboarding button, single instance lock,
  app branding with productName Canvas Companion, appId com.aaravchhabra.canvas-dashboard-mac
- Phase 4.3 COMPLETE — standalone .app build via electron-builder, right-click
  tray context menu with quit option, DMG installer at release/

## Current app state
- Version: 1.0.0
- App name: Canvas Companion
- appId: com.aaravchhabra.canvas-dashboard-mac
- Three connection methods working: REST API (preferred), Session Cookie (GraphQL), iCal (fallback)
- UW Canvas PAT confirmed working — curl test returns valid user data
- REST API relative URLs fixed — prepend canvasBaseUrl before shell.openExternal
- Standalone .app built and installable from DMG
- Left click tray = toggle panel, right click tray = context menu with quit
- Single instance lock prevents duplicate app launches

## Phase 4 — Canvas data enrichment and standalone app (COMPLETE)

### Note on authentication
Canvas Companion is a local personal app — no backend, no server, no accounts.
Each user runs their own copy with their own credentials stored locally.
Authentication (OAuth, Supabase, etc.) is NOT needed for this model and is
out of scope until a potential Version 2.0 web/cloud rebuild.
The three connection methods (iCal, REST API, Session Cookie) are not
"login" methods — they are just ways to pull data from Canvas into the
local app. No user accounts are created or managed anywhere.

### Phase 4.1 — Canvas GraphQL API (COMPLETE)
- Canvas GraphQL API using browser session cookie
- GraphQL endpoint: https://canvas.uw.edu/api/graphql
- Falls back to iCal if GraphQL request fails
- Session cookie stored in electron-store under settings.canvasSessionCookie

### Phase 4.1.1 — UW CSE course site scraper (COMPLETE)
Many UW CSE courses have their own websites separate from Canvas at:
`https://courses.cs.washington.edu/courses/cseXXX/YYqq/`
URL format: courses/cseXXX/YYqq/ where qq = au/wi/sp/su for the quarter

Key files:
- electron/cseScraper.ts — scrapes /assignments/, /resubs/, and calendar page
- Scrapes released assignments, resubmissions, and unreleased calendar entries
- Assignment type updated in src/shared/types.ts — source includes 'cse-site'
- electron-store key cseSiteUrls — array of {url, courseName} objects
- Settings panel — UW CSE Course Sites section to add/remove site URLs
- AssignmentItem.tsx — CSE site assignments show a small CSE badge

### Phase 4.2 — Onboarding setup guide (COMPLETE)
- Full guided onboarding rebuilt in src/renderer/Onboarding.tsx
- Three setup method cards: iCal Feed, API Token, Session Cookie
- Step-by-step guide pages for each method with framer-motion animations
- Optional UW CSE course sites step
- First sync screen showing assignment count on success

### Phase 4.2.1 — Minor improvements (COMPLETE)
- Back to onboarding button in settings panel
- Single instance lock via app.requestSingleInstanceLock()
- productName: Canvas Companion, appId: com.aaravchhabra.canvas-dashboard-mac
- App category: public.app-category.education
- Version bumped to 1.0.0

### Phase 4.3 — Standalone app (COMPLETE)
- electron-builder produces DMG installer in release/ folder
- Right-click tray context menu with Open Dashboard, Preferences, Quit
- Left click = toggle panel, right click = context menu
- Unsigned build — right-click Open first time to bypass Gatekeeper
- release/ in .gitignore so DMG never committed to GitHub

## Phase 5 — Smart deadline intelligence (COMPLETE)

### Calendar tab
- Add a third tab called Calendar alongside Assignments and Courses
- Shows the full current month as a proper calendar grid
- Each day cell is shaded by assignment load — more assignments and higher
  point values = darker/more saturated color (like a heatmap)
  Implementation: Map<date string, {count: number, points: number}>
  Color scale: empty=transparent, light=1-2 assignments, medium=3-4, dark=5+
- Each day with assignments shows short badges (truncated course code + title)
  inside the day cell — e.g. "MATH 126 - HW 4"
- Clicking a day expands to show all assignments due that day
- Calendar resyncs on every refresh cycle with the rest of the data
- Helps students see crunch weeks at a glance for the whole quarter

### Estimated time-to-complete
- Each assignment row gets a time tag button (tap to set: 15min, 1hr, 3hr, 5hr+)
- Stored in electron-store keyed by assignment ID — survives syncs
- Header shows "Today's load: ~4.5 hrs" summing estimates for today's assignments
- Implementation: Record<assignmentId, estimateMinutes> in electron-store

### Daily digest notification
- Optional 8 AM notification summarizing the day
- Format: "3 due today · 2 due tomorrow · 1 overdue"
- Single notification replacing N individual lead-time notifications
- Toggle in settings — off by default, user opts in
- Implemented via node-cron scheduled at 08:00 daily

## Phase 5.2 — UI/UX refinements (COMPLETE)

### Command palette
- Cmd+K inside the panel opens a fuzzy search overlay across all assignments
- Uses fuse.js for fuzzy matching
- Search by assignment title, course name, or due date
- Enter opens Canvas URL, Escape closes palette
- Glass-inset styled overlay matching the rest of the app

### Keyboard navigation
- Left/right arrow keys switch between Assignments, Courses, Calendar tabs
- Up/down keys scroll naturally through assignment rows (default behavior)
- Escape closes the panel

### Compact/expanded view toggle
- Small toggle button in panel header (list/expand icon)
- Compact: title and due date only, 32px row height, hides course name and estimates
- Expanded: full metadata including course name, time estimate, submission badge
- Preference persisted in electron-store as settings.viewMode: 'compact' | 'expanded'

### Snooze
- Right-click on any assignment row opens a context menu
- Options: Snooze 1 hour, Snooze until tomorrow, Snooze until next sync
- Snoozed assignments hidden from main view
- Small snooze count badge in footer with unsnooze option
- Snooze state stored in electron-store as Record<assignmentId, snoozeUntil: ISO string>
- Auto-unsnoozes when snoozeUntil time has passed

### Calendar heatmap colors (fixed)
- 0 assignments: transparent
- 1-2 assignments: #F59E0B at 0.25 opacity — bright yellow
- 3-4 assignments: #F97316 at 0.45 opacity — vivid orange
- 5+ assignments: #EF4444 at 0.65 opacity — bright red
- Overdue day: #B91C1C at 0.85 opacity — dark red

### Personal tasks UI fixed
- Task form uses glass-inset styling matching the rest of the app
- Date picker styled with white text and transparent background
- No more black or dark solid backgrounds

### Enhanced liquid glass visuals
- Backdrop blur increased to 60px on main glass class
- Inner glow added to glass cards
- Aurora gradient more vibrant
- Subtle animated shimmer on panel header
- Glass card hover state with scale(1.005) and smooth transitions

## Phase 5.1 — Cross-device and sync (DEFERRED — building after Phase 5.3)
Deferred to after shipping. iCloud sync for personal tasks is a nice-to-have
that only helps users with multiple Macs. Shipping Phase 5.3 first is higher priority.

### iCloud sync for personal tasks (when built)
- Move storage to ~/Library/Mobile Documents/com~apple~CloudDocs/CanvasCompanion/tasks.json
- Syncs automatically across all Macs via iCloud for free
- No backend or server needed

## Phase 5.3 — Reliability, shipping polish and deployment (PLANNED)

### Deployment and distribution
- Code sign and notarize with Apple Developer ID ($99/year)
- Build universal binary supporting Apple Silicon and Intel
- Write README explaining all three setup options for other students
- Optional open-source release on GitHub

### Auto-update
- Implement electron-updater for automatic app updates
- Requires code signing to work properly

### Crash recovery
- Wrap all electron-store reads in try/catch
- Fall back to empty state if cache is corrupted

### Diagnostic health panel
- Hidden page in settings (tap version number 5 times to unlock)
- Shows last sync timestamp, sync history, API response codes, parse errors

### Sentry error reporting with PII scrubbing
- Only send: error type, stack trace, app version, macOS version
- Toggle in settings — on by default, user can opt out

## Phase 6 — Stretch and future (PLANNED)

### Multi-Canvas instance support
- Add instanceId field to every Course and Assignment object in types.ts
- electron-store structure: instances[] array each with their own credentials

### Grade tracking (requires REST API or GraphQL)
- Show running grade percentage per course in the Courses tab
- "What you need on the final to keep an A" calculation per course

### Quick capture global hotkey
- Cmd+Shift+Space opens a tiny floating input anywhere on the Mac
- Uses Electron globalShortcut API

## Version 1.1 / 1.2 — Post-shipping updates
- Grade tracking
- Quick capture global hotkey
- Additional time estimate options
- User-requested features based on feedback

### Version 2.0 — Future web/cloud rebuild (NOT in scope now)
- Would require Supabase or similar backend
- OAuth 2.0 login with Canvas per institution
- Complete rebuild, not an extension of the current app

## I know Java but not JavaScript/TypeScript
Explain things in Java terms when helpful.