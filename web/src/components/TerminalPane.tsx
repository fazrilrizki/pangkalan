import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useLayoutEffect, useRef } from 'react';
import type { ServerMessage } from '@integrasi/shared';
import { wsUrl } from '../lib/api';
import type { ConnectionState } from '../lib/ws-client';
import { SessionSocket } from '../lib/ws-client';
import { terminalThemes } from '../lib/terminal-theme';
import { useTheme } from '../lib/theme';
import { QuickKeys } from './QuickKeys';

export interface TerminalPaneProps {
  sessionId: string;
  active: boolean;
  onServerMessage?: (message: ServerMessage) => void;
  onConnectionChange?: (state: ConnectionState) => void;
}

export function TerminalPane({
  sessionId,
  active,
  onServerMessage,
  onConnectionChange,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<SessionSocket | null>(null);
  const handlersRef = useRef({ onServerMessage, onConnectionChange });
  handlersRef.current = { onServerMessage, onConnectionChange };
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useLayoutEffect(() => {
    const container = containerRef.current!;
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: '"Cascadia Code", "Cascadia Mono", Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.15,
      scrollback: 10_000,
      allowProposedApi: true,
      theme: terminalThemes[themeRef.current],
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(container);
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      terminal.loadAddon(webgl);
    } catch {
      // WebGL unavailable: xterm falls back to the DOM renderer
    }
    terminalRef.current = terminal;
    fitRef.current = fit;

    const socket = new SessionSocket(() => wsUrl(`/ws/sessions/${sessionId}`), {
      onMessage: (message) => {
        if (message.type === 'replay') {
          // Each (re)connect replays the whole scrollback, so start from a clean screen.
          terminal.reset();
          terminal.write(message.data);
        } else if (message.type === 'output') {
          terminal.write(message.data);
        }
        handlersRef.current.onServerMessage?.(message);
      },
      onStateChange: (state) => {
        if (state === 'open') sendSize();
        handlersRef.current.onConnectionChange?.(state);
      },
    });
    socketRef.current = socket;

    function sendSize() {
      if (!container.offsetParent) return; // hidden tab: keep the last size
      fit.fit();
      socket.send({ type: 'resize', cols: terminal.cols, rows: terminal.rows });
    }

    const input = terminal.onData((data) => socket.send({ type: 'input', data }));

    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(sendSize, 50);
    });
    observer.observe(container);

    return () => {
      clearTimeout(resizeTimer);
      observer.disconnect();
      input.dispose();
      socket.dispose();
      terminal.dispose();
      terminalRef.current = null;
      socketRef.current = null;
    };
  }, [sessionId]);

  useLayoutEffect(() => {
    if (terminalRef.current) terminalRef.current.options.theme = terminalThemes[theme];
  }, [theme]);

  useLayoutEffect(() => {
    if (!active) return;
    const terminal = terminalRef.current;
    const fit = fitRef.current;
    if (!terminal || !fit) return;
    // Focus right away so keystrokes typed just after switching tabs are not lost.
    terminal.focus();
    // Wait a frame so the now-visible container has its real size.
    const frame = requestAnimationFrame(() => {
      fit.fit();
      socketRef.current?.send({ type: 'resize', cols: terminal.cols, rows: terminal.rows });
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return (
    <div
      className="h-full w-full flex-col"
      style={{ display: active ? 'flex' : 'none' }}
      data-testid={`terminal-${sessionId}`}
    >
      <div ref={containerRef} className="isolate min-h-0 w-full flex-1" />
      <QuickKeys
        onKey={(data) => {
          socketRef.current?.send({ type: 'input', data });
          terminalRef.current?.focus();
        }}
      />
    </div>
  );
}
