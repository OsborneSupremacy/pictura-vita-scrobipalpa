import { iconFor } from './registry';

interface Props {
  name: string | null | undefined;
  size?: number;
  className?: string;
}

/**
 * Renders a category's icon, or nothing at all.
 *
 * An unknown name draws nothing rather than a placeholder: data written by a build with a
 * wider icon set should degrade to a plain heading, not to a broken-image glyph.
 */
export function CategoryIcon({ name, size = 14, className }: Props) {
  const Icon = iconFor(name);
  if (!Icon) return null;

  return <Icon size={size} strokeWidth={2} aria-hidden="true" className={className} />;
}
