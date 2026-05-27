import { Icon } from './Icon';
import { useT } from '../useT';
import type { IconName } from '@shared/icons';
import type { StringKey } from '@shared/strings';

export type TabKey = 'library' | 'chat' | 'inbox' | 'skills' | 'settings';

const TABS: { key: TabKey; label: StringKey; icon: IconName }[] = [
  { key: 'library',  label: 'tab_library',  icon: 'archive' },
  { key: 'chat',     label: 'tab_chat',     icon: 'spark' },
  { key: 'inbox',    label: 'tab_inbox',    icon: 'clip' },
  { key: 'skills',   label: 'tab_skills',   icon: 'thread' },
  { key: 'settings', label: 'tab_settings', icon: 'gear' },
];

export function TabBar({
  active,
  onChange,
  inboxCount,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
  inboxCount: number;
}) {
  const { t } = useT();
  return (
    <nav className="tabs" role="tablist">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          className="tab"
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => onChange(tab.key)}
        >
          <Icon name={tab.icon} size={14} />
          <span className="tab-label">{t(tab.label)}</span>
          {tab.key === 'inbox' && inboxCount > 0 && (
            <span className="tab-badge">{inboxCount}</span>
          )}
        </button>
      ))}
    </nav>
  );
}
