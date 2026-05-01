import { format, formatDistanceToNowStrict, isToday } from 'date-fns'
import { ExternalLink, Clock } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Assignment } from '../shared/types'

function getCourseColor(courseName: string): string {
  const colors = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EC4899', '#14B8A6', '#EF4444', '#F97316']
  let hash = 0
  for (let i = 0; i < courseName.length; i++) {
    hash = courseName.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

interface Props {
  assignment: Assignment
  index: number
  completed: boolean
  onToggleComplete: (id: string) => void
}

export function AssignmentItem({ assignment, index, completed, onToggleComplete }: Props) {
  const due = assignment.dueAt ? new Date(assignment.dueAt) : null
  const overdue = !completed && assignment.isOverdue
  const dueToday = due ? isToday(due) : false
  const dueColor = overdue
    ? 'hsl(var(--danger))'
    : dueToday
    ? 'hsl(35 80% 60%)'
    : 'hsl(var(--muted-foreground))'

  function openUrl() {
    if (assignment.canvasUrl) window.ipcRenderer.send('open-external', assignment.canvasUrl)
  }

  function openExternal(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    console.log('[AssignmentItem] ExternalLink clicked, canvasUrl:', assignment.canvasUrl)
    openUrl()
  }

  function handleCheckbox(e: React.MouseEvent) {
    e.stopPropagation()
    onToggleComplete(assignment.id)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: completed ? 0.5 : 1, y: 0 }}
      transition={{ delay: index * 0.02, duration: 0.25 }}
      className="glass-inset rounded-xl p-3 flex items-start gap-3 hover:bg-white/5 transition-colors"
    >
      {/* Checkbox — stopPropagation so it doesn't open URL */}
      <div className="pt-0.5 shrink-0">
        <button
          onClick={handleCheckbox}
          aria-label={completed ? 'Mark as incomplete' : 'Mark as complete'}
          className="w-4 h-4 rounded flex items-center justify-center transition-colors"
          style={{
            border: completed ? 'none' : '2px solid hsl(0 0% 100% / 0.5)',
            backgroundColor: completed ? 'hsl(212 90% 60%)' : 'transparent',
          }}
        >
          {completed && (
            <svg viewBox="0 0 10 8" className="w-2.5 h-2">
              <path d="M1 4l2.5 3L9 1" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>

      {/* Clickable content area — opens Canvas URL */}
      <div
        onClick={openUrl}
        className="flex items-start gap-2 flex-1 min-w-0 cursor-pointer"
      >
        {/* Course color dot */}
        <div className="shrink-0 mt-1.5">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getCourseColor(assignment.courseName) }} />
        </div>

        {/* Text content */}
        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground truncate">
              {assignment.courseName}
            </span>
            {assignment.source === 'cse-site' && (
              <span
                className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
                style={{
                  background: `${getCourseColor(assignment.courseName)}22`,
                  color: getCourseColor(assignment.courseName),
                  border: `1px solid ${getCourseColor(assignment.courseName)}44`,
                }}
              >
                CSE
              </span>
            )}
          </div>
          <div
            className={`text-sm font-medium leading-snug truncate ${
              completed ? 'line-through text-muted-foreground' : 'text-foreground'
            }`}
          >
            {assignment.title}
          </div>
          {due && (
            <div className="flex items-center gap-1.5 text-xs">
              <Clock className="w-3 h-3 shrink-0" style={{ color: dueColor }} />
              <span style={{ color: dueColor }}>
                {format(due, 'MMM d, h:mm a')} · {overdue ? 'overdue ' : ''}
                {formatDistanceToNowStrict(due, { addSuffix: true })}
              </span>
            </div>
          )}
        </div>

        {/* External link icon */}
        {assignment.canvasUrl && (
          <button
            onClick={openExternal}
            className="shrink-0 mt-0.5 p-1 rounded-lg hover:bg-white/10 transition-colors"
            title="Open in Canvas"
          >
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        )}
      </div>
    </motion.div>
  )
}
