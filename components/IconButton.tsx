import type { LucideIcon } from 'lucide-react';

export function IconButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-fill-hover hover:text-fg"
    >
      <Icon className="size-[18px]" strokeWidth={1.75} />
    </button>
  );
}
