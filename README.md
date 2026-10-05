# Canvas Companion

A macOS menu bar app that shows your Canvas LMS deadlines the moment you open your laptop. No browser tab, no login, no clicking around.

Works with any school that uses Canvas. All you need is your Canvas calendar feed link.

<p>
  <img src="screenshots/main.png" width="32%" alt="Main panel">
  <img src="screenshots/courses.png" width="32%" alt="Courses tab">
  <img src="screenshots/calendar.png" width="32%" alt="Calendar tab">
</p>

## Why I built it

Canvas hides your deadlines inside a browser tab. You have to go looking to find out what's due. Assignments get missed not because you forgot them, but because nothing reminded you at the right time.

Canvas Companion fixes that by living in the menu bar. Your workload is always one glance away, and native notifications fire before things are due.

## Features

- **Urgency buckets.** Assignments sorted into Overdue, Today, Tomorrow, This Week, and Coming Up.
- **Native notifications.** Configurable lead times (24h, 2h, 30 min, 15 min), with a button that opens the assignment in Canvas.
- **Auto sync.** Refreshes on a timer, on wake from sleep, and on demand.
- **Meetings and office hours.** Calendar events show up with an "Event" tag and stay out of notifications and due counts.
- **Personal tasks.** Add your own to-dos alongside Canvas items. Stored locally only.
- **Calendar view.** See your deadlines laid out by day, with a workload heatmap.
- **Command palette and search.** Fuzzy search across assignments, plus full keyboard navigation.
- **Snooze and mark as done.** Hide an assignment for an hour or until tomorrow, or check it off.
- **Course colors.** Per-course color coding and visibility toggles.
- **Light and dark mode** with a frosted glass panel.
- **Runs quietly.** Starts at login, stays out of the Dock and app switcher, shows a badge count for items due today.

## How it connects to Canvas

| Method | What you need | What you get |
| --- | --- | --- |
| **Calendar feed (recommended)** | Your iCal feed link from Canvas | Titles, due dates, courses, links. Works at any school. |
| **Personal access token** | A token from Canvas settings, if your school allows them | Everything above, plus submission status and points. |

Many schools, including UW, no longer let students create access tokens. The calendar feed is a standard Canvas feature every student has, so it works everywhere.

## Tech stack

| Area | Tools |
| --- | --- |
| App shell | Electron, Node.js |
| UI | React 18, TypeScript, Tailwind CSS v4, framer-motion |
| Build | Vite, electron-builder (.dmg) |
| Data | Canvas iCal feed (ical.js), Canvas REST API and GraphQL (axios) |
| Storage | keytar (macOS Keychain) for tokens, electron-store for settings and cache |
| Other | node-cron, fuse.js, date-fns |

## Interesting problems I solved

**Click outside to close.** Electron's blur event can't tell "the user clicked outside" apart from "the user pressed Cmd-Tab." Every blur-based fix failed one way or the other. The working solution is an invisible full-screen window that sits behind the panel and catches clicks. It uses a data URL page and intercepts navigation in the main process, so it needed no extra build config.

**All-day deadlines in the calendar feed.** Canvas exports assignments due at 11:59 PM as date-only events, with no time attached. Read naively, they show up as midnight at the start of the day, almost 24 hours early. The app rebuilds them as 11:59 PM local time on that date.

**Building real assignment links.** The feed's link field points to the Canvas calendar, not the assignment. The app pulls the assignment ID from the event's ID and the course ID from the link, then builds the direct assignment URL. The host comes from the feed itself, so links work at any school.

**Notifications that don't double-fire.** Notifications are scheduled per deadline with timers, separate from the sync loop. Each one has a key built from the assignment ID, lead time, and due date. Fired keys are saved to disk, so restarting the app doesn't repeat notifications.

**Timezone bugs.** `new Date("2026-10-04")` gives UTC midnight, which is the previous evening in Pacific time. Dates are parsed from their parts into local time instead.

**Token security.** Access tokens live only in the macOS Keychain. They are never written to disk, never logged, and never sent to the UI process.

## Running it yourself

**Requirements:** macOS 13 or later, Node.js 20.

```bash
git clone https://github.com/AaravChhabra13/Canvas-Companion.git
cd Canvas-Companion
npm install
npm run build
```

The packaged app ends up in the build output folder. It is unsigned, so the first time you open it, right-click the app and choose **Open** to get past Gatekeeper.

**Getting your calendar feed link:** In Canvas, open **Calendar** from the left sidebar and click **Calendar Feed** at the bottom right. Copy the link and paste it in during onboarding or in Settings.

Keep that link private. Anyone who has it can see your Canvas calendar.

Note: `npm run dev` only starts the UI with hot reload. It does not run the main process, so use a full build to test tray, sync, or notification behavior.

## Project structure

```
electron/
  main.ts            App lifecycle, tray, panel and backdrop windows
  sync.ts            Canvas iCal, REST and GraphQL sync
  notifications.ts   Notification scheduling and daily digest
  ipc.ts             IPC handlers, settings, tray badge
  preload.ts         The only bridge between main and UI
src/
  renderer/
    Panel.tsx        Main panel: state, IPC wiring, keyboard nav
    components/      SettingsPanel, CalendarView, GroupedList, AddTaskForm, etc.
  lib/               Grouping, labels and helper functions
  shared/types.ts    Types shared by main and UI
screenshots/         Images used in this README
```

## What's next

- Fill the Settings course list for calendar feed users, so course colors can be set there
- Fall back to the calendar feed automatically when a token stops working
- Tests for the iCal parser
- A native SwiftUI rewrite

## Author

Built by [Aarav Chhabra](https://github.com/AaravChhabra13), a student at the University of Washington.

Not affiliated with or endorsed by Instructure or the University of Washington.