import { cycleTheme, useTheme } from '../lib/theme';
import type { ThemeChoice } from '../lib/theme';
import { Icon } from './Icon';

const LABEL: Record<ThemeChoice, string> = {
  system: 'Tema: ikuti sistem (klik untuk terang)',
  light: 'Tema: terang (klik untuk gelap)',
  dark: 'Tema: gelap (klik untuk ikuti sistem)',
};

const ICON = { system: 'monitor', light: 'sun', dark: 'moon' } as const;

export function ThemeToggle() {
  const { choice } = useTheme();
  return (
    <button
      className="icon-btn"
      aria-label={LABEL[choice]}
      title={LABEL[choice]}
      onClick={cycleTheme}
    >
      <Icon name={ICON[choice]} />
    </button>
  );
}
