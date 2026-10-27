import { useSyncExternalStore } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const KEY = 'integrasi.theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

function readChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

let choice: ThemeChoice = readChoice();

export function resolveTheme(value: ThemeChoice, systemDark: boolean): Theme {
  if (value === 'system') return systemDark ? 'dark' : 'light';
  return value;
}

function currentTheme(): Theme {
  return resolveTheme(choice, media().matches);
}

function apply() {
  document.documentElement.dataset.theme = currentTheme();
  listeners.forEach((listener) => listener());
}

export function initTheme() {
  apply();
  media().addEventListener('change', apply);
}

/** Cycles system → light → dark → system. */
export function cycleTheme() {
  choice = choice === 'system' ? 'light' : choice === 'light' ? 'dark' : 'system';
  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // per-viewer convenience only
  }
  apply();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): { choice: ThemeChoice; theme: Theme } {
  const theme = useSyncExternalStore(subscribe, currentTheme);
  const current = useSyncExternalStore(subscribe, () => choice);
  return { choice: current, theme };
}
