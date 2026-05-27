import { Icon } from './Icon';

interface Counts { notes: number; sources: number; inbox: number }

export function TitleBar({ counts }: { counts: Counts }) {
  return (
    <header className="sp-titlebar">
      <span className="sp-logo" aria-hidden>
        <Icon name="brand" size={20} />
      </span>
      <span className="sp-name">Hearth</span>
      <span className="sp-count">{counts.notes} notes · {counts.sources} sources</span>
    </header>
  );
}
