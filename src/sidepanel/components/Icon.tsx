/**
 * React wrapper around the shared icon set.
 * For Shadow DOM / content scripts use `iconSvg()` from shared/icons.ts directly.
 */

import { iconSvg, type IconName } from '@shared/icons';

export function Icon({
  name,
  size = 18,
  className,
  title,
}: {
  name: IconName;
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      style={{ display: 'inline-flex', lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: iconSvg(name, size) }}
    />
  );
}
