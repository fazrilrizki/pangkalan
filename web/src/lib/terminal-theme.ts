import type { ITheme } from '@xterm/xterm';
import type { Theme } from './theme';

// Backgrounds match --term in index.css so the pane and its padding read as one surface.
const dark: ITheme = {
  background: '#121110',
  foreground: '#e2dcd4',
  cursor: '#4fa59a',
  cursorAccent: '#121110',
  selectionBackground: '#4fa59a40',
  black: '#26231f',
  red: '#ef7a7f',
  green: '#8fc98a',
  yellow: '#e8b25c',
  blue: '#7aa2f7',
  magenta: '#c79be0',
  cyan: '#6cc0b4',
  white: '#d9d3cb',
  brightBlack: '#6f685f',
  brightRed: '#ff9a9e',
  brightGreen: '#b2e0a8',
  brightYellow: '#f5ca85',
  brightBlue: '#9ab8ff',
  brightMagenta: '#dcb8f0',
  brightCyan: '#94d8cd',
  brightWhite: '#f7f3ee',
};

// Darker ANSI hues so CLI output stays readable on a near-white background.
const light: ITheme = {
  background: '#fbf9f6',
  foreground: '#2a2622',
  cursor: '#2a7268',
  cursorAccent: '#fbf9f6',
  selectionBackground: '#2a726830',
  black: '#2a2622',
  red: '#b02f3c',
  green: '#2f7a39',
  yellow: '#8a5a10',
  blue: '#2c5bc4',
  magenta: '#8a3fa8',
  cyan: '#1f6f66',
  white: '#8b847b',
  brightBlack: '#6f685f',
  brightRed: '#c8404f',
  brightGreen: '#3c8a45',
  brightYellow: '#a06a14',
  brightBlue: '#3567d6',
  brightMagenta: '#9b52ba',
  brightCyan: '#2a7268',
  brightWhite: '#4a443e',
};

export const terminalThemes: Record<Theme, ITheme> = { dark, light };
