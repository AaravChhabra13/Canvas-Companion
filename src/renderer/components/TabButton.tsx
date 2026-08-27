export const TabButton = ({
  active, onClick, children,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
      active
        ? 'bg-white/10 text-foreground'
        : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
    }`}
  >
    {children}
  </button>
)
