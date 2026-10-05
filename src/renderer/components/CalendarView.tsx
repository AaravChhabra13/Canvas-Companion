import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { AssignmentItem } from '../AssignmentItem'
import { dateKey } from '../../lib/panelHelpers'
import type { Assignment } from '../../shared/types'

function getDayBackground(count: number, hasOverdue: boolean): string {
  if (hasOverdue) return 'rgba(185, 28, 28, 0.85)'
  if (count === 0) return 'transparent'
  if (count <= 2) return 'rgba(245, 158, 11, 0.25)'
  if (count <= 4) return 'rgba(249, 115, 22, 0.45)'
  return 'rgba(239, 68, 68, 0.65)'
}

export function CalendarView({
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
                : { background: getDayBackground(badges.filter(a => a.type !== 'event').length, badges.some(a => a.isOverdue)), borderRadius: '6px', outline: 'none' }
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
