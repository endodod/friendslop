"use client";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CHAT_MAX_LENGTH, colorHex, type ChatMessage } from "@party-game/shared";
import { useStore } from "@/lib/store";
import { send } from "@/lib/socket";
import { play } from "@/lib/sfx";
import { Avatar, usePlayers } from "./ui";

/**
 * Room chat: a floating button with an unread badge that opens a small chat panel.
 * New messages pop up as a bubble next to the button while the panel is closed.
 * Displays (TV) can read but not write.
 */
export function ChatDock() {
  const chat = useStore((s) => s.chat);
  const role = useStore((s) => s.role);
  const playerId = useStore((s) => s.playerId);
  const stage = useStore((s) => s.pub?.stage);
  const hostId = useStore((s) => s.pub?.hostId);
  const players = usePlayers();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const [peek, setPeek] = useState<ChatMessage | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const lastId = useRef<string | null>(null);

  // Messages that arrived while closed: badge + a short preview bubble.
  useEffect(() => {
    const last = chat[chat.length - 1];
    if (!last || last.id === lastId.current) return;
    const first = lastId.current === null;
    lastId.current = last.id;
    if (open) return setSeen(chat.length);
    if (first) return setSeen(chat.length); // history on join is not "new"
    if (last.playerId !== playerId) {
      setPeek(last);
      play("click", { volume: 0.3 });
      const t = setTimeout(() => setPeek(null), 4000);
      return () => clearTimeout(t);
    }
  }, [chat, open, playerId]);

  useEffect(() => {
    if (open) {
      setSeen(chat.length);
      setPeek(null);
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [open, chat.length]);

  const unread = Math.max(0, chat.length - seen);
  const canWrite = role === "player" && !!playerId;
  // Keep clear of the lobby's sticky Start bar (host only).
  const bottom = stage === "lobby" && hostId === playerId ? "bottom-36" : "bottom-4";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    const res = await send("chat:send", { text: t });
    setSending(false);
    if (res.ok) setText("");
  }

  return (
    <div className={`fixed right-3 z-[70] flex flex-col items-end gap-2 ${bottom}`}>
      <AnimatePresence>
        {open && (
          <motion.section
            key="panel"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="card flex h-[min(26rem,60dvh)] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden p-0 shadow-2xl"
            aria-label="Chat"
            data-testid="chat-panel"
          >
            <header className="flex items-center justify-between border-b border-line px-4 py-2">
              <h2 className="font-display text-xl">Chat</h2>
              <button className="btn-ghost min-h-9 min-w-9 p-1" aria-label="Close chat" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <ul ref={listRef} className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-3" aria-live="polite">
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
                  className="input min-h-11 flex-1 py-2 text-base"
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
                <button className="btn-primary min-h-11 min-w-11 px-3" type="submit" disabled={!text.trim() || sending} aria-label="Send">
                  <Send size={18} />
                </button>
              </form>
            ) : (
              <p className="border-t border-line p-2 text-center text-xs text-muted">Join as a player to chat.</p>
            )}
          </motion.section>
        )}
      </AnimatePresence>
      <div className="flex flex-row-reverse items-center gap-2">
        <button
          className="relative flex h-12 w-12 items-center justify-center rounded-full bg-panel-2 shadow-xl ring-1 ring-line transition-transform active:scale-90"
          aria-label={open ? "Close chat" : `Open chat${unread ? ` (${unread} new)` : ""}`}
          onClick={() => setOpen((o) => !o)}
          data-testid="chat-button"
        >
          <MessageCircle size={22} />
          {unread > 0 && !open && (
            <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-bad px-1 text-center font-display text-xs leading-5 text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
        <AnimatePresence>
          {peek && !open && (
            <motion.button
              key={peek.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              onClick={() => setOpen(true)}
              className="flex max-w-[min(16rem,calc(100vw-5rem))] items-center gap-2 rounded-2xl bg-panel-2 py-1.5 pl-1.5 pr-3 text-left text-sm shadow-xl ring-1 ring-line"
            >
              <Avatar player={players[peek.playerId]} size={26} />
              <span className="line-clamp-2 min-w-0">
                <b className="font-display">{players[peek.playerId]?.name}:</b> {peek.text}
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
