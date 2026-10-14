import { History, Settings, SquarePen } from 'lucide-react';
import { IconButton } from './IconButton';

export function TopBar({ onNewChat }: { onNewChat: () => void }) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between px-3">
      <IconButton icon={SquarePen} label="New chat" onClick={onNewChat} />
      <div className="flex items-center gap-1">
        <IconButton icon={History} label="History" />
        <IconButton icon={Settings} label="Settings" />
      </div>
    </header>
  );
}
