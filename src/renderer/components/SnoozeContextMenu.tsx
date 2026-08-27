export function SnoozeContextMenu({
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
