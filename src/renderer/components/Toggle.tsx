export function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: (v: boolean) => void }) {
  return (
    <button
      role="switch" aria-checked={enabled}
      onClick={() => onToggle(!enabled)}
      style={{
        flexShrink: 0,
        width: 40,
        height: 24,
        background: enabled ? 'hsl(212 90% 60%)' : 'hsl(0 0% 100% / 0.15)',
      }}
      className="relative rounded-full transition-colors overflow-hidden"
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0'}`}
      />
    </button>
  )
}
