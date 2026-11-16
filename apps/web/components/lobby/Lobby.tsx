"use client";
import { motion } from "framer-motion";
import { Copy, Crown, LogOut, Play, Settings2, UserX, Wifi, WifiOff } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GAME_CONFIG, dataQuestionsAvailable, localize, type RoomSettings } from "@party-game/shared";
import { clientContent } from "@party-game/content";
import { Avatar, Icon, MuteButton, useIsHost, useMe } from "../ui";
import { ColorPicker } from "../ColorPicker";
import { useStore } from "@/lib/store";
import { act } from "@/lib/useRoom";
import { LinkedAccounts } from "./LinkedAccounts";

export function Lobby({ code, onLeave }: { code: string; onLeave: () => Promise<void> }) {
  const pub = useStore((s) => s.pub)!;
  const role = useStore((s) => s.role);
  const me = useMe();
  const isHost = useIsHost();
  const router = useRouter();
  const [joinUrl, setJoinUrl] = useState("");
  useEffect(() => setJoinUrl(`${window.location.origin}/r/${code}`), [code]);

  const players = pub.players;
  const allReady = players.length >= GAME_CONFIG.players.min && players.every((p) => p.ready);
  const meRoom = players.find((p) => p.id === me?.id);
  const isDisplay = role === "display";

  return (
    <main className={`mx-auto flex min-h-dvh flex-col gap-4 px-4 py-5 ${isDisplay ? "max-w-6xl" : "max-w-2xl"}`}>
      <header className="flex items-center justify-between gap-2">
        <h1 className="font-display text-2xl text-accent">Lobby</h1>
        <div className="flex items-center gap-1">
          <MuteButton />
          {!isDisplay && (
            <button
              className="btn-ghost min-h-11 px-3"
              onClick={async () => {
                await onLeave();
                router.push("/");
              }}
            >
              <LogOut size={18} /> Leave
            </button>
          )}
        </div>
      </header>

      <div className={`grid gap-4 ${isDisplay ? "lg:grid-cols-[1fr_1.2fr]" : ""}`}>
        <section className="card flex flex-col items-center gap-3 p-5 text-center">
          <p className="text-muted">Room code</p>
          <p className="font-display text-6xl tracking-[0.25em] text-accent" data-testid="room-code">
            {code}
          </p>
          {joinUrl && (
            <div className={`rounded-2xl bg-white p-3 ${isDisplay ? "" : "hidden sm:block"}`}>
              <QRCodeSVG value={joinUrl} size={isDisplay ? 220 : 140} />
            </div>
          )}
          <button
            className="btn-ghost text-sm"
            onClick={() => {
              navigator.clipboard?.writeText(joinUrl);
              useStore.getState().toast("Link copied!", "good");
            }}
          >
            <Copy size={16} /> {joinUrl.replace(/^https?:\/\//, "")}
          </button>
        </section>

        <section className="card flex flex-col gap-3 p-5">
          <h2 className="font-display text-2xl">
            Players <span className="text-muted">{players.length}/4</span>
          </h2>
          <ul className="flex flex-col gap-2">
            {players.map((p) => (
              <motion.li
                layout
                key={p.id}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-3 rounded-2xl bg-bg-2 p-2 pr-3"
              >
                <Avatar player={p} size={44} dim={!p.connected} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-2 truncate font-display text-xl">
                    {p.name}
                    {pub.hostId === p.id && <Crown size={16} className="text-accent" aria-label="Host" />}
                    {p.id === me?.id && <span className="text-sm text-muted">(you)</span>}
                  </span>
                  <span className="flex items-center gap-2 text-sm text-muted">
                    {p.connected ? <Wifi size={14} /> : <WifiOff size={14} className="text-bad" />}
                    {p.linked.filter((l) => l.status === "ok").map((l) => (
                      <span key={l.provider} className="rounded-full bg-panel-2 px-2 text-xs">
                        {l.provider}: {l.displayName}
                      </span>
                    ))}
                  </span>
                </div>
                <span
                  className={`rounded-full px-3 py-1 font-display text-sm ${p.ready ? "bg-good text-[#06210f]" : "bg-panel-2 text-muted"}`}
                >
                  {p.ready ? "Ready" : "Not ready"}
                </span>
                {isHost && p.id !== me?.id && (
                  <button
                    className="btn-ghost min-h-11 min-w-11 px-2"
                    aria-label={`Kick ${p.name}`}
                    onClick={() => act("room:kick", { playerId: p.id })}
                  >
                    <UserX size={18} />
                  </button>
                )}
              </motion.li>
            ))}
            {players.length === 0 && <li className="text-muted">Waiting for players to join…</li>}
          </ul>
          {pub.displays > 0 && (
            <p className="text-sm text-muted">
              <Icon id="life" size={14} className="mr-1 align-[-2px]" />
              {pub.displays} shared screen{pub.displays > 1 ? "s" : ""} connected
            </p>
          )}
        </section>
      </div>

      {meRoom && (
        <section className="card flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl">You</h2>
            <button
              data-testid="ready-button"
              className={meRoom.ready ? "btn-secondary" : "btn-primary"}
              onClick={() => act("player:ready", { ready: !meRoom.ready })}
            >
              {meRoom.ready ? "Not ready" : "I'm ready!"}
            </button>
          </div>
          <ColorPicker
            value={meRoom.color}
            taken={players.map((p) => p.color)}
            onChange={(color) => act("room:profile", { color })}
          />
          <LinkedAccounts />
        </section>
      )}

      <SettingsPanel settings={pub.settings} editable={isHost} canData={dataQuestionsAvailable(pub as never)} />

      {isHost && (
        <section className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t border-line bg-bg/95 px-4 pb-4 pt-3 backdrop-blur">
          <button
            data-testid="start-button"
            className="btn-primary min-h-14 text-2xl"
            disabled={!allReady}
            onClick={() => act("game:start", { mode: "board" })}
          >
            <Play size={24} /> Start game
          </button>
          {!allReady && (
            <p className="text-center text-sm text-muted">
              {players.length < 2 ? "Need at least 2 players." : "Waiting for everyone to be ready."}
            </p>
          )}
          <button
            className="btn-ghost text-sm"
            disabled={!allReady}
            onClick={() => act("game:start", { mode: "questionDebug" })}
          >
            Question rounds only (no board)
          </button>
        </section>
      )}
    </main>
  );
}

function SettingsPanel({ settings, editable, canData }: { settings: RoomSettings; editable: boolean; canData: boolean }) {
  const set = (patch: Partial<RoomSettings>) => act("room:settings", patch);
  const themes = clientContent.themes;
  return (
    <section className="card flex flex-col gap-4 p-5">
      <h2 className="flex items-center gap-2 font-display text-2xl">
        <Settings2 size={22} /> Settings {!editable && <span className="text-sm text-muted">(host decides)</span>}
      </h2>
      <Row label="Turns">
        <Segmented
          value={settings.turnCount}
          options={GAME_CONFIG.turns.options.map((n) => ({ value: n, label: String(n) }))}
          disabled={!editable}
          onChange={(turnCount) => set({ turnCount })}
        />
      </Row>
      <Row label="Question tiles">
        <Segmented
          value={settings.pacing}
          options={[
            { value: "low", label: "Few" },
            { value: "normal", label: "Normal" },
            { value: "high", label: "Lots" },
          ]}
          disabled={!editable}
          onChange={(pacing) => set({ pacing })}
        />
      </Row>
      <div className="flex flex-col gap-2">
        <span className="font-display text-lg">Themes</span>
        <div className="flex flex-wrap gap-2">
          {themes.map((t) => {
            const on = settings.themes.includes(t.id);
            return (
              <button
                key={t.id}
                disabled={!editable}
                aria-pressed={on}
                onClick={() =>
                  set({ themes: on ? settings.themes.filter((x) => x !== t.id) : [...settings.themes, t.id] })
                }
                className="flex min-h-11 items-center gap-2 rounded-full border-2 px-3 font-display transition-all disabled:cursor-default"
                style={{
                  borderColor: t.color,
                  background: on ? t.color : "transparent",
                  color: on ? "#14112a" : t.color,
                  opacity: on ? 1 : 0.65,
                }}
              >
                <Icon id={t.icon} size={18} />
                {localize(t.name)}
              </button>
            );
          })}
        </div>
      </div>
      <Toggle
        label="Family-friendly (no spicy questions)"
        value={settings.familyFriendly}
        disabled={!editable}
        onChange={(familyFriendly) => set({ familyFriendly })}
      />
      <Toggle
        label={`Data questions${canData ? "" : " (link an account first)"}`}
        value={settings.dataQuestions && canData}
        disabled={!editable || !canData}
        onChange={(dataQuestions) => set({ dataQuestions })}
      />
      <Row label="Language">
        <Segmented
          value={settings.language}
          options={[
            { value: "en", label: "English" },
            { value: "de", label: "Deutsch" },
          ]}
          disabled={!editable}
          onChange={(language) => set({ language })}
        />
      </Row>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="font-display text-lg">{label}</span>
      {children}
    </div>
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  disabled,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-2xl bg-bg-2 p-1" role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`min-h-11 min-w-11 rounded-xl px-3 font-display transition-colors disabled:cursor-default ${
            o.value === value ? "bg-accent text-[#241a00]" : "text-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, value, disabled, onChange }: { label: string; value: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`flex min-h-11 items-center justify-between gap-3 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <span className="font-display text-lg">{label}</span>
      <button
        role="switch"
        aria-checked={value}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${value ? "bg-good" : "bg-bg-2 border-2 border-line"}`}
      >
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${value ? "left-7" : "left-1"}`} />
      </button>
    </label>
  );
}
