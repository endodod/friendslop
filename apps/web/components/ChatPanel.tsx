"use client";
import { Send } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CHAT_MAX_LENGTH, colorHex } from "@party-game/shared";
import { useStore } from "@/lib/store";
import { send } from "@/lib/socket";
import { play } from "@/lib/sfx";
import { Avatar, usePlayers } from "./ui";

/**
 * Room chat, embedded in the page (lobby and game sidebars). Keeps itself scrolled to the newest
 * message unless you scrolled up to read older ones. Displays (TV) can read but not write.
 */
export function ChatPanel({ className = "", height = "h-72" }: { className?: string; height?: string }) {
  const chat = useStore((s) => s.chat);
  const role = useStore((s) => s.role);
  const playerId = useStore((s) => s.playerId);
  const players = usePlayers();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  /** Was the list scrolled to (near) the bottom before the newest message arrived? */
  const stick = useRef(true);
  const lastId = useRef<string | null>(null);

  // Auto-scroll to new messages (always for your own).
  useLayoutEffect(() => {
    const el = listRef.current;
    const last = chat[chat.length - 1];
    if (!el) return;
    const first = lastId.current === null;
    if (stick.current || first || last?.playerId === playerId) el.scrollTop = el.scrollHeight;
    if (last && !first && last.id !== lastId.current && last.playerId !== playerId) play("click", { volume: 0.3 });
    lastId.current = last?.id ?? "";
  }, [chat, playerId]);

  // Messages can grow the list after images/fonts load: keep the bottom pinned.
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const canWrite = role === "player" && !!playerId;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    const res = await send("chat:send", { text: t });
    setSending(false);
    if (res.ok) {
      setText("");
      stick.current = true;
    }
  }

  return (
    <section className={`card flex shrink-0 flex-col overflow-hidden p-0 ${height} ${className}`} aria-label="Chat" data-testid="chat-panel">
      <h3 className="border-b border-line px-3 py-2 font-display text-muted">Chat</h3>
      <ul
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-2"
        aria-live="polite"
      >
        {chat.length === 0 && <li className="m-auto text-sm text-muted">No messages yet. Say hi!</li>}
        {chat.map((m, i) => {
          const p = players[m.playerId];
          const mine = m.playerId === playerId;
          const grouped = i > 0 && chat[i - 1].playerId === m.playerId && m.at - chat[i - 1].at < 60_000;
          return (
            <li key={m.id} className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""} ${grouped ? "-mt-1" : ""}`}>
              <span className="w-7 shrink-0">{!grouped && <Avatar player={p} size={28} />}</span>
              <div className={`flex max-w-[75%] flex-col ${mine ? "items-end" : "items-start"}`}>
                {!grouped && !mine && (
                  <span className="px-1 font-display text-xs" style={{ color: p ? colorHex(p.color) : undefined }}>
                    {p?.name ?? "Someone who left"}
                  </span>
                )}
                <p
                  className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm leading-snug ${mine ? "rounded-br-md text-[#14112a]" : "rounded-bl-md bg-bg-2"}`}
                  style={mine && p ? { background: colorHex(p.color) } : undefined}
                >
                  {m.text}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      {canWrite ? (
        <form onSubmit={submit} className="flex gap-2 border-t border-line p-2">
          <input
            className="input min-h-10 flex-1 py-1.5 text-base"
            value={text}
            maxLength={CHAT_MAX_LENGTH}
            placeholder="Message…"
            aria-label="Chat message"
            enterKeyHint="send"
            onChange={(e) => setText(e.target.value)}
            // Keep game hotkeys (Space etc.) from firing while typing.
            onKeyDown={(e) => e.stopPropagation()}
            data-testid="chat-input"
          />
          <button className="btn-primary min-h-10 min-w-10 px-3" type="submit" disabled={!text.trim() || sending} aria-label="Send">
            <Send size={18} />
          </button>
        </form>
      ) : (
        <p className="border-t border-line p-2 text-center text-xs text-muted">Join as a player to chat.</p>
      )}
    </section>
  );
}
