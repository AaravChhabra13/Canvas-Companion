import { useState } from 'react'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'

function MiniCalendar({ selected, onSelect }: { selected: string; onSelect: (val: string) => void }) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const startWeekday = new Date(viewYear, viewMonth, 1).getDay()
  const todayStr = today.toISOString().slice(0, 10)
  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1) }
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1) }
  return (
    <div className="glass-inset rounded-xl p-2">
      <div className="flex items-center justify-between mb-1 px-1">
        <button onClick={prevMonth} className="p-0.5 rounded hover:bg-white/10 transition-colors">
          <ChevronLeft className="w-3 h-3 text-muted-foreground" />
        </button>
        <span className="text-xs font-medium text-foreground">
          {format(new Date(viewYear, viewMonth, 1), 'MMMM yyyy')}
        </span>
        <button onClick={nextMonth} className="p-0.5 rounded hover:bg-white/10 transition-colors">
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>
      <div className="grid grid-cols-7 mb-0.5">
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] text-muted-foreground/60 py-0.5">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: startWeekday }, (_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isSelected = dateStr === selected
          const isCurrentDay = dateStr === todayStr
          return (
            <button key={day} onClick={() => onSelect(dateStr)}
              className={['text-[11px] rounded-md py-0.5 text-center transition-colors',
                isSelected ? 'bg-primary text-primary-foreground font-medium'
                  : isCurrentDay ? 'text-primary font-medium hover:bg-white/10'
                  : 'text-foreground/80 hover:bg-white/10'].join(' ')}>
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function AddTaskForm({ onAdd, onCancel }: { onAdd: (title: string, dueAt: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [hour, setHour] = useState('11')
  const [minute, setMinute] = useState('00')
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('PM')
  const [showCal, setShowCal] = useState(false)
  const buildDueAt = () => {
    if (!dueDate) return ''
    let h = Number(hour)
    if (ampm === 'AM') h = h === 12 ? 0 : h
    else h = h === 12 ? 12 : h + 12
    // dueDate is "YYYY-MM-DD" from the picker; parse as local components, not via
    // new Date(string) which would interpret it as UTC midnight and shift the date
    // backward in any timezone west of UTC.
    const [y, mo, dd] = dueDate.split('-').map(Number)
    const d = new Date(y, mo - 1, dd)
    d.setHours(h, Number(minute), 0, 0)
    return d.toISOString()
  }
  const submit = () => { if (title.trim()) onAdd(title.trim(), buildDueAt()) }
  const dateTriggerLabel = dueDate ? format(new Date(dueDate + 'T12:00:00'), 'EEE, MMM d') : 'No due date'
  return (
    <div className="mx-4 mb-3 p-3 glass-inset rounded-xl flex flex-col gap-2 shrink-0">
      <input
        autoFocus type="text" placeholder="Task title" value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }}
        className="w-full bg-transparent rounded-xl px-3 py-2 text-xs text-white/80 placeholder:text-white/30 outline-none focus:ring-1 focus:ring-primary/50 border border-white/20"
      />
      <button onClick={() => setShowCal(v => !v)}
        className="w-full glass-inset rounded-lg px-3 py-1.5 text-xs flex items-center justify-between">
        <span className={dueDate ? 'text-foreground' : 'text-muted-foreground/60'}>{dateTriggerLabel}</span>
        <CalendarIcon className="w-3 h-3 text-muted-foreground" />
      </button>
      {showCal && <MiniCalendar selected={dueDate} onSelect={d => { setDueDate(d); setShowCal(false) }} />}
      {dueDate && (
        <div className="flex items-center gap-1.5">
          <select value={hour} onChange={e => setHour(e.target.value)}
            className="glass-inset rounded-lg px-2 py-1.5 text-xs text-foreground outline-none appearance-auto">
            {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(h => (
              <option key={h} value={String(h)}>{h}</option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">:</span>
          <select value={minute} onChange={e => setMinute(e.target.value)}
            className="glass-inset rounded-lg px-2 py-1.5 text-xs text-foreground outline-none appearance-auto">
            {['00', '15', '30', '45'].map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <button onClick={() => setAmpm(v => v === 'AM' ? 'PM' : 'AM')}
            className="glass-inset rounded-lg px-2 py-1.5 text-xs text-foreground hover:bg-white/10 transition-colors">
            {ampm}
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
          Cancel
        </button>
        <button onClick={submit} disabled={!title.trim()}
          className="flex-1 py-1.5 rounded-lg text-xs font-medium text-primary-foreground disabled:opacity-40"
          style={{ background: title.trim() ? 'var(--gradient-primary)' : undefined }}>
          Add Task
        </button>
      </div>
    </div>
  )
}
