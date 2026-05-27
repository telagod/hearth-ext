import { Icon } from './Icon';

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="sp-search">
      <Icon name="search" size={14} />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? '搜索…'}
      />
      {value && (
        <button className="iconbtn" onClick={() => onChange('')} title="clear">
          <Icon name="cross" size={12} />
        </button>
      )}
    </div>
  );
}
