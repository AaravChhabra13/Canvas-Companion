import { BookOpen } from 'lucide-react'
import { AssignmentItem } from '../AssignmentItem'
import { groupAssignments, GROUP_ORDER, GROUP_LABELS } from '../../lib/groupAssignments'

// ── Grouped assignment list ───────────────────────────────────────────────────

const TODAY_COLOR = 'hsl(35 80% 60%)'

export const GroupedList = ({
  groups, completed, onToggle, estimates, onSetEstimate, showEstimate,
  compact = false, itemCompact = false, onSnooze,
}: {
  groups: ReturnType<typeof groupAssignments>
  completed: Set<string>
  onToggle: (id: string) => void
  estimates: Record<string, number>
  onSetEstimate: (id: string, minutes: number | null) => void
  showEstimate: boolean
  compact?: boolean
  itemCompact?: boolean
  onSnooze?: (id: string, position: { x: number; y: number }) => void
}) => (
  <div className={`${compact ? '' : 'p-4'} flex flex-col gap-5`}>
    {GROUP_ORDER.map((key) => {
      const items = groups[key]
      if (!items.length) return null
      const labelColor =
        key === 'overdue' ? 'hsl(var(--danger))'
        : key === 'today' ? TODAY_COLOR
        : 'hsl(var(--muted-foreground))'
      return (
        <section key={key} className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: labelColor }}>
              {GROUP_LABELS[key]}
            </h2>
            <span className="text-[10px] text-muted-foreground/60">{items.length}</span>
            <div className="flex-1 h-px bg-white/5" />
          </div>
          <div className="flex flex-col gap-1.5">
            {items.map((a, i) => (
              <AssignmentItem
                key={a.id}
                assignment={a}
                index={i}
                completed={completed.has(a.id)}
                onToggleComplete={onToggle}
                estimate={estimates[a.id]}
                onSetEstimate={onSetEstimate}
                showEstimate={showEstimate}
                compact={itemCompact}
                onSnooze={onSnooze}
              />
            ))}
          </div>
        </section>
      )
    })}
  </div>
)

// ── Empty state ───────────────────────────────────────────────────────────────

export const EmptyState = () => (
  <div className="p-8 flex flex-col items-center text-center gap-4 mt-6">
    <div
      className="w-16 h-16 rounded-2xl flex items-center justify-center"
      style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--shadow-glow)' }}
    >
      <BookOpen className="w-8 h-8 text-primary-foreground" />
    </div>
    <div>
      <h3 className="text-base font-semibold mb-1">No assignments found</h3>
      <p className="text-xs text-muted-foreground leading-relaxed max-w-70">
        All clear! No upcoming assignments right now.
      </p>
    </div>
  </div>
)


export function ExternalLinkIcon() {
  return (
    <svg className="w-3 h-3 text-muted-foreground/40 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}
