import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { send, subscribe } from "../hooks/useIPC";

function b64encode(data: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < data.length; i++) bin += String.fromCharCode(data[i]);
  return btoa(bin);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface Props {
  active: boolean;
}

export function TerminalView({ active }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!ref.current || termRef.current) return;

    const term = new Terminal({
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      fontSize: 13,
      cursorBlink: true,
      scrollback: 10000,
      theme: { background: "#0a0a0a", foreground: "#e6e6e6" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(ref.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const encoder = new TextEncoder();

    // Local echo tracker: a rough mirror of what the user has typed
    // on the current line (since the last Enter). xterm.js has no
    // concept of "current input" — the shell/REPL owns it in the PTY
    // child — so we build a best-effort buffer ourselves from onData.
    // Used by the Ctrl+C override below to decide between "clear line"
    // and "SIGINT".
    let lineBuffer = "";
    const trackInput = (data: string) => {
      for (const ch of data) {
        if (ch === "\r" || ch === "\n") {
          lineBuffer = "";
        } else if (ch === "\x7f" || ch === "\b") {
          lineBuffer = lineBuffer.slice(0, -1);
        } else if (ch >= " " && ch !== "\x7f") {
          // Printable character.
          lineBuffer += ch;
        } else if (ch === "\x15" || ch === "\x03") {
          // Ctrl+U / Ctrl+C both clear the current line from the
          // shell's perspective.
          lineBuffer = "";
        }
        // Other control bytes / escape sequences (cursor keys etc.)
        // don't usefully change the buffer for our purpose.
      }
    };

    // Cmd+C (copy) / Cmd+V (paste) on macOS, Ctrl+Shift+C/V elsewhere.
    // navigator.clipboard is blocked in wry's webview context — go
    // through the native IPC handlers (clipboard_read / clipboard_write)
    // that route via the `arboard` crate on the Rust side.
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      const isMac = navigator.platform.startsWith("Mac");
      const mod = isMac ? e.metaKey : e.ctrlKey && e.shiftKey;

      // Plain Ctrl+C (any OS): if the user has typed something on the
      // current line, erase it instead of interrupting. An empty line
      // falls through to the default handler → PTY receives \x03 →
      // shell / REPL sees SIGINT.
      if (
        e.type === "keydown" &&
        e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey &&
        (e.key === "c" || e.key === "C")
      ) {
        if (lineBuffer.length > 0) {
          // Send Ctrl+U to the PTY — tells readline / bash / zsh /
          // rustyline to kill the current input line. Reset our local
          // mirror too so the next Ctrl+C behaves correctly.
          send({
            type: "pty_write",
            data: b64encode(encoder.encode("\x15")),
          });
          lineBuffer = "";
          return false;
        }
        return true; // empty line → pass \x03 through as SIGINT
      }

      if (mod && e.key === "c" && e.type === "keydown") {
        const sel = term.getSelection();
        if (sel) {
          send({ type: "clipboard_write", text: sel });
          return false; // handled, don't send to PTY
        }
        // No selection on Mac Cmd+C → let it pass as interrupt (Ctrl+C)
        if (!isMac) return false;
      }

      if (mod && e.key === "v" && e.type === "keydown") {
        const unsub = subscribe((msg) => {
          if (msg.type === "clipboard_text") {
            unsub();
            if (msg.ok && typeof msg.text === "string" && msg.text.length > 0) {
              send({
                type: "pty_write",
                data: b64encode(encoder.encode(msg.text as string)),
              });
            }
          }
        });
        send({ type: "clipboard_read" });
        return false;
      }

      return true; // pass all other keys through
    });

    // Keystrokes → Rust. Mirror into the local input buffer so the
    // Ctrl+C override can see the current line.
    term.onData((data) => {
      trackInput(data);
      send({ type: "pty_write", data: b64encode(encoder.encode(data)) });
    });

    term.onResize(({ cols, rows }) => {
      send({ type: "pty_resize", cols, rows });
    });

    // Rust → terminal
    const unsub = subscribe((msg) => {
      if (msg.type === "pty_data" && typeof msg.data === "string") {
        term.write(b64decode(msg.data));
      } else if (msg.type === "pty_exit") {
        term.write(
          "\r\n\x1b[33m[child exited — restart from sidebar]\x1b[0m\r\n"
        );
      } else if (msg.type === "terminal_clear") {
        // Triggered when the user starts a new session from the sidebar.
        // The backend has already sent `/clear\n` to the PTY child so its
        // agent drops its history; here we wipe the visible scrollback.
        term.reset();
        term.clear();
      }
    });

    // Request PTY spawn
    send({
      type: "pty_spawn",
      cols: term.cols,
      rows: term.rows,
    });

    const ro = new ResizeObserver((entries) => {
      // Ignore zero-size entries: they happen when the tab is hidden with
      // `display: none`. Fitting to 0x0 would lock the terminal into a dead
      // state until we manually refit on return.
      const e = entries[0];
      if (!e || e.contentRect.width === 0 || e.contentRect.height === 0) return;
      try {
        fit.fit();
      } catch {}
    });
    ro.observe(ref.current);

    return () => {
      unsub();
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  // When the tab becomes active again, re-fit and grab focus so the cursor
  // returns and keystrokes reach the PTY.
  useEffect(() => {
    if (!active) return;
    const t = termRef.current;
    const f = fitRef.current;
    if (!t) return;
    requestAnimationFrame(() => {
      try { f?.fit(); } catch {}
      t.focus();
    });
  }, [active]);

  return (
    <div
      ref={ref}
      className="h-full w-full p-1.5"
      style={{ background: "#0a0a0a" }}
    />
  );
}
