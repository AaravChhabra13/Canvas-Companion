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
- UW Canvas does NOT allow personal access tokens — REST API is blocked
  for UW students but works for students at other Canvas schools
- App uses iCal feed as primary/fallback data source for all users
- iCal feed does not provide Canvas assignment URLs — clicking assignments
  does not open Canvas yet, fixed in Phase 4
- electron-store always needs a name field: new Store({ name: 'app-store' })
- Always fix bugs in source files in electron/ and src/ only
- Tailwind v4 syntax: use @import "tailwindcss" not @tailwind directives
- postcss.config.js must use @tailwindcss/postcss as the plugin
- REST API code already exists in electron/canvasApi.ts with Bearer token
  auth hitting /api/v1/users/self, /api/v1/courses, /api/v1/planner/items

## Completed phases
- Phase 1 COMPLETE — iCal feed fetch, urgency bucketing, basic panel UI
- Phase 2 COMPLETE — onboarding flow, course colors, wake sync, notifications
- Phase 3 COMPLETE — dark/light mode, mark as done, menu bar badge,
  frosted glass, personal tasks, course filter tabs, hide old overdue
- Phase 3.1 COMPLETE — full liquid glass UI/UX upgrade, aurora background,
  animated assignment rows, course color coding, overdue/today color labels,
  clear overdue button, settings as animated page, course drill-down

## Phase 4 — Canvas data enrichment and standalone app (IN PROGRESS)

### Note on authentication
Canvas Companion is a local personal app — no backend, no server, no accounts.
Each user runs their own copy with their own credentials stored locally.
Authentication (OAuth, Supabase, etc.) is NOT needed for this model and is
out of scope until a potential Version 2.0 web/cloud rebuild.
The three connection methods (iCal, REST API, Session Cookie) are not
"login" methods — they are just ways to pull data from Canvas into the
local app. No user accounts are created or managed anywhere.

### Phase 4.1 — Canvas GraphQL API
- Implement Canvas GraphQL API using browser session cookie
- GraphQL endpoint: https://canvas.uw.edu/api/graphql
- Gives us real Canvas assignment URLs so clicking rows opens Canvas
- Add session cookie input field in settings panel
- Fall back to iCal if GraphQL request fails
- Works for UW students who cannot use PATs

### Phase 4.1.1 — UW CSE course site scraper (COMPLETE)
Many UW CSE courses have their own websites separate from Canvas at:
`https://courses.cs.washington.edu/courses/cseXXX/YYqq/`
This phase scrapes the /assignments/ subpage of these sites and merges
the results with Canvas assignments under the same course.

Key files:
- electron/cseScraper.ts — scrapes CSE site /assignments/ page using axios,
  parses HTML to extract title, due date, URL for each assignment
  URL format: https://courses.cs.washington.edu/courses/cseXXX/YYqq/
  where YY = 2-digit year and qq = quarter code:
  au = Autumn, wi = Winter, sp = Spring, su = Summer
  Examples: 25au, 26wi, 26sp, 26su
  The user pastes the full URL for their current quarter manually
- Assignment type updated in src/shared/types.ts — source field now includes
  'cse-site' as a valid value
- electron/sync.ts — after Canvas sync, runs CSE scraper for each saved site
  URL and merges/deduplicates results preferring CSE site URLs
- electron-store key cseSiteUrls — array of {url, courseName} objects
- Settings panel — new 'UW CSE Course Sites' section to add/remove site URLs
- AssignmentItem.tsx — assignments from CSE site show a small 'CSE' badge

Assignment types from CSE sites:
- P# items = Programming Assignments
- C# items = Creative Projects  
- R# items = Resubmissions
- Clicking an assignment opens the specification PDF or EdStem submission link

Onboarding: optional step after main Canvas setup asking if user has UW CSE
courses — skippable for non-CSE students.

### Phase 4.2 — Onboarding setup guide
Build a proper guided onboarding that explains all three connection options
clearly to users who have no idea what iCal, REST API, or GraphQL means.

Structure:
- Onboarding welcome screen shows "Canvas Companion" branding
- Step: Choose your setup method — three cards:
  1. iCal Feed (Recommended for most) — works everywhere, no login needed
  2. API Token (Best experience) — works at schools that allow it, not UW
  3. Session Cookie (UW students) — works at UW, requires a few extra steps
- Each card has a short one-line description in plain english
- Each card has a "How to set this up" button opening a separate guide page
- Guide pages explain step by step how to get the required credential:

  iCal guide steps:
  1. Log into Canvas
  2. Click Calendar in the left sidebar
  3. Scroll to the bottom and click Calendar Feed
  4. Copy the URL and paste it here

  API Token guide steps:
  1. Log into Canvas
  2. Click your profile picture → Settings
  3. Scroll to Approved Integrations
  4. Click New Access Token
  5. Give it a name like Canvas Companion
  6. Copy the token and paste it here
  Note: UW students — your school blocks this option, use Session Cookie

  Session Cookie guide steps:
  1. Log into Canvas in Chrome
  2. Press Cmd+Option+I to open Developer Tools
  3. Click the Network tab
  4. Click any page on Canvas
  5. Click any request in the list
  6. Click Headers → scroll to Request Headers
  7. Find the Cookie header and copy its entire value
  8. Paste it here
  Note: This expires when you log out of Canvas — re-paste when it stops working

- After completing setup, first sync runs and shows assignment count
- Guide pages use framer-motion slide animations matching the rest of the UI
- All text written in plain friendly language, no technical jargon

### Phase 4.3 — Standalone app outside VS Code
- Build the app as a proper standalone .app using electron-builder
- App runs from Applications folder like any normal Mac app
- No terminal needed to launch — double click to open
- Right-click tray icon to quit instead of closing terminal
- Auto-launches on login via app.setLoginItemSettings
- Unsigned build for personal use — right-click Open to bypass Gatekeeper
- Document this limitation clearly in onboarding

## Phase 5 — Smart deadline intelligence (PLANNED)

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
- Toggle in settings - off by default, user opts in

### Daily digest notification
- Optional 8 AM notification summarizing the day
- Format: "3 due today · 2 due tomorrow · 1 overdue"
- Single notification replacing N individual lead-time notifications
- Toggle in settings — off by default, user opts in
- Implemented via node-cron scheduled at 08:00 daily

## Phase 5.1 — Cross-device and sync (PLANNED)

### iCloud sync for personal tasks
- Personal tasks currently stored locally in electron-store
- Move storage path to ~/Library/Mobile Documents/com~apple~CloudDocs/
  CanvasCompanion/tasks.json
- Syncs automatically across all the user's Macs via iCloud for free
- No backend, no server, no account needed
- One config change in the electron-store initialization path

### Web companion view
- On each sync, write a static read-only HTML file of the current dashboard
  to ~/Desktop/canvas-companion.html or a user-chosen path
- User can open this file on their phone browser to see assignments
- No server needed — pure static HTML with inline CSS
- Auto-regenerated on every sync so it stays current
- Stretch feature — low effort, high value for mobile glancing

## Phase 5.2 — UI/UX refinements (PLANNED)

### Command palette
- Cmd+K inside the panel opens a fuzzy search across all assignments
- Search by assignment title, course name, or due date
- Use fuse.js for fuzzy matching (npm install fuse.js)
- Results show assignment title, course, and due date
- Enter opens the Canvas URL, Escape closes the palette
- Implementation: overlay component with input + filtered assignment list

### Keyboard navigation
- Arrow keys move focus through assignment rows
- Enter opens Canvas URL for focused assignment
- Space marks focused assignment as done
- Cmd+D dismisses all overdue assignments at once
- Escape closes the panel
- Low effort, high value for power users

### Compact/expanded view toggle
- Toggle button in header switches between two view modes
- Compact: title and due date only, smaller row height (32px)
- Expanded: full metadata — course name, time estimate, submission badge
- Preference persisted in electron-store as viewMode: 'compact' | 'expanded'

### Snooze
- Right-click on any assignment row opens a context menu
- Options: Snooze 1 hour, Snooze until tomorrow, Snooze until next sync
- Snoozed assignments hidden from main view with a small snooze badge
  on the tray icon showing count of snoozed items
- Snooze state stored in electron-store as
  Record<assignmentId, snoozeUntil: ISO timestamp>
- Automatically un-snoozed after the snooze period expires

## Phase 5.3 — Reliability, shipping polish and deployment (PLANNED)
This phase also includes everything from the original Phase 5 shipping plan.

### Deployment and distribution
- Rename app display name to Canvas Companion everywhere in UI
- Code sign and notarize with Apple Developer ID ($99/year)
- Build universal binary supporting Apple Silicon and Intel via electron-builder
- Write README explaining all three setup options for other students
- Optional open-source release on GitHub

### Auto-update
- Implement electron-updater for automatic app updates
- ~30 lines of code using electron-builder's built-in updater
- Requires code signing to work properly
- Eliminates manual re-download problem noted in TRD

### Crash recovery
- Wrap all electron-store reads in try/catch
- If assignment cache is corrupted fall back to empty state instead of crashing
- Like Java: try { store.get() } catch (e) { return defaultValue }
- Show a subtle "cache reset" notice in the panel footer if recovery occurred

### Diagnostic health panel
- Hidden page in settings (tap version number 5 times to unlock)
- Shows: last sync timestamp, sync history (last 10 syncs), API response codes,
  iCal parse errors, GraphQL errors, electron-store file size
- Hugely useful for debugging user-reported issues after shipping

### Sentry error reporting with PII scrubbing
- Add Sentry SDK for crash and error reporting
- Scrub all PII before sending — no assignment titles, no course names,
  no URLs, no tokens in payloads
- Only send: error type, stack trace, app version, macOS version
- Toggle in settings — on by default, user can opt out

## Phase 6 — Stretch and future (PLANNED)

### Multi-Canvas instance support
- TRD marks this as v2 but design the data model now to avoid painful migration
- Add instanceId field to every Course and Assignment object in types.ts
- electron-store structure: instances[] array each with their own
  url, authMethod, token/cookie, courses, assignments
- UI: instance switcher in the header or settings
- Sync engine runs independently per instance

### Grade tracking (requires Phase 4 GraphQL or REST API)
- Canvas API returns scores and possible points per assignment
- Show running grade percentage per course in the Courses tab
- "What you need on the final to keep an A" calculation per course
- Displayed as a subtle progress bar under each course name
- Only available when GraphQL or REST API is active — not available with iCal

### Quick capture global hotkey
- Cmd+Shift+Space opens a tiny floating input anywhere on the Mac
- Type a personal task title and optionally a due date
- Press Enter to save — task appears in the panel immediately
- Uses Electron globalShortcut API — registers on app launch
- Stored in electron-store personal tasks same as the + button in panel

## Version 1.1 / 1.2 — Post-shipping updates
Features to build after the initial public release:

- Grade tracking (if GraphQL/REST is stable from Phase 6)
- Quick capture global hotkey
- Additional time estimate options and productivity insights
- User-requested features based on feedback after open-source release

### Version 2.0 — Future web/cloud rebuild (NOT in scope now)
If Canvas Companion ever becomes a web service with shared accounts:
- Would require a backend (Supabase or similar)
- OAuth 2.0 login with Canvas per institution
- User accounts, cloud sync, web dashboard
- This is a complete rebuild, not an extension of the current app

## I know Java but not JavaScript/TypeScript
Explain things in Java terms when helpful.