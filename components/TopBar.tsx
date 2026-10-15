import { Download, History, Settings, SquarePen } from 'lucide-react';
import { IconButton } from './IconButton';
import { useTranslation } from 'react-i18next';

export function TopBar({
  onNewChat,
  onHistory,
  onSettings,
  onExport,
}: {
  onNewChat: () => void;
  onHistory: () => void;
  onSettings: () => void;
  /** Shown once the conversation has a finished answer to export. */
  onExport?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <header className="flex h-12 shrink-0 items-center justify-between px-3">
      <IconButton icon={SquarePen} label={t('topBar.newChat')} onClick={onNewChat} />
      <div className="flex items-center gap-1">
        {onExport && <IconButton icon={Download} label={t('topBar.export')} onClick={onExport} />}
        <IconButton icon={History} label={t('topBar.history')} onClick={onHistory} />
        <IconButton icon={Settings} label={t('topBar.settings')} onClick={onSettings} />
      </div>
    </header>
  );
}
