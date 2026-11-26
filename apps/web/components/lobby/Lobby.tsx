"use client";
import { motion } from "framer-motion";
import { Bot, Copy, Crown, LogOut, Play, Settings2, UserX, Wifi, WifiOff } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  GAME_CONFIG,
  HUB_SETTING_OPTIONS,
  canStart,
  dataQuestionsAvailable,
  gameInfo,
  localize,
  type RoomSettings,
  type RoomSettingsPatch,
} from "@party-game/shared";
import { clientContent } from "@party-game/content";
import { Avatar, Icon, MuteButton, useIsHost, useMe } from "../ui";
import { AvatarPicker } from "../AvatarPicker";
import { ColorPicker } from "../ColorPicker";
import { saveAvatar, saveColor, saveUsePhoto } from "@/lib/session";
import { useAccount } from "@/lib/account";
import { useStore } from "@/lib/store";
import { act } from "@/lib/useRoom";
import { MINIGAME_CLIENTS } from "@party-game/minigames/client";
import { MapPicker } from "./MapPicker";
import { PackPicker } from "./PackPicker";
import { TileMix } from "./TileMix";
import { MinigameMix } from "./MinigameMix";
import { CustomQuestions } from "./CustomQuestions";
import { InviteFriends } from "./InviteFriends";
import { GamePicker, TeamsPanel } from "./GamePicker";
import { GameBadge } from "../hub/common";
import { ChatPanel } from "../ChatPanel";
import { LobbyProfileLink } from "../account/AccountChip";
import Link from "next/link";

export function Lobby({ code, onLeave }: { code: string; onLeave: () => Promise<void> }) {
  const pub = useStore((s) => s.pub)!;
  const role = useStore((s) => s.role);
  const me = useMe();
  const isHost = useIsHost();
  const router = useRouter();
  const [joinUrl, setJoinUrl] = useState("");
  useEffect(() => setJoinUrl(`${window.location.origin}/r/${code}`), [code]);

  const players = pub.players;
  const gameId = pub.settings.gameId ?? "party";
  const info = gameInfo(gameId);
  const isParty = gameId === "party";
  const startCheck = canStart(pub as never);
  const allReady = startCheck.ok;
  const meRoom = players.find((p) => p.id === me?.id);
  const isDisplay = role === "display";
  const [practice, setPractice] = useState("red-light");
  const accountPhoto = useAccount((s) => s.user?.photo ?? null);
  const accountUserId = useAccount((s) => s.user?.id ?? null);
  // Back from a (long, scrolled) results screen: start at the top of the lobby.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <main className={`mx-auto flex min-h-dvh flex-col gap-4 px-4 py-5 ${isDisplay ? "max-w-6xl" : "max-w-2xl"}`}>
      <header className="flex items-center justify-between gap-2">
        <h1 className="flex min-w-0 items-center gap-2 font-display text-2xl text-accent">
          Lobby <GameBadge info={info} size="sm" />
        </h1>
        <div className="flex items-center gap-1">
          {!isDisplay && <LobbyProfileLink />}
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

      <div className={`grid grid-cols-[minmax(0,1fr)] gap-4 ${isDisplay ? "lg:grid-cols-[1fr_1.2fr]" : ""}`}>
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
            Players <span className="text-muted">{players.length}/{GAME_CONFIG.players.max}</span>
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
                  <span className="flex min-w-0 items-center gap-2 font-display text-xl">
                    <span className="truncate">{p.name}</span>
                    {pub.hostId === p.id && <Crown size={16} className="text-accent" aria-label="Host" />}
                    {p.id === me?.id && <span className="text-sm text-muted">(you)</span>}
                    {p.bot && <span className="rounded-full bg-panel-2 px-2 text-xs text-muted">bot</span>}
                  </span>
                  {p.username && !isDisplay && (
                    <Link href={`/u/${encodeURIComponent(p.username)}`} target="_blank" className="w-fit truncate text-xs text-muted hover:underline">
                      @{p.username}
                    </Link>
                  )}
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
          {isHost && players.length < GAME_CONFIG.players.max && (
            <button
              className="btn-secondary w-fit"
              data-testid="add-bot"
              title="Bots play randomly. Handy for testing the game with fewer people."
              onClick={() => act("room:addBot", {})}
            >
              <Bot size={18} /> Add a bot
            </button>
          )}
          {pub.displays > 0 && (
            <p className="text-sm text-muted">
              <Icon id="life" size={14} className="mr-1 align-[-2px]" />
              {pub.displays} shared screen{pub.displays > 1 ? "s" : ""} connected
            </p>
          )}
        </section>
      </div>

      <GamePicker />

      {gameId === "spygrid" && <TeamsPanel />}

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
            onChange={(color) => {
              saveColor(color);
              act("room:profile", { color });
            }}
          />
          <AvatarPicker
            value={meRoom.avatar}
            color={meRoom.color}
            name={meRoom.name}
            onChange={(avatar) => {
              saveAvatar(avatar);
              if (accountPhoto) saveUsePhoto(false);
              act("room:profile", accountPhoto && meRoom.userId === accountUserId ? { avatar, usePhoto: false } : { avatar });
            }}
            photo={meRoom.userId === accountUserId ? accountPhoto : null}
            usePhoto={!!meRoom.photo}
            onUsePhoto={() => {
              saveUsePhoto(true);
              act("room:profile", { usePhoto: true });
            }}
          />
        </section>
      )}

      <ChatPanel height="h-64" />

      {meRoom && <InviteFriends />}

      {isParty && <CustomQuestions />}

      {isParty ? (
        <SettingsPanel settings={pub.settings} editable={isHost} canData={dataQuestionsAvailable(pub as never)} />
      ) : (
        <HubSettingsPanel settings={pub.settings} editable={isHost} playerCount={players.length} />
      )}

      {isHost && (
        <section className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t border-line bg-bg/95 px-4 pb-4 pt-3 backdrop-blur">
          <button
            data-testid="start-button"
            className="btn-primary min-h-14 text-2xl"
            disabled={!allReady}
            onClick={() => act("game:start", { mode: "board" })}
          >
            <Play size={24} /> Start {info.name}
          </button>
          {!startCheck.ok && <p className="text-center text-sm text-muted">{startCheck.reason}</p>}
          {isParty && (
          <details className="text-sm text-muted">
            <summary className="cursor-pointer py-2 text-center">Practice modes</summary>
            <div className="flex flex-col gap-2 pt-2">
              <button className="btn-secondary min-h-11 text-base" disabled={!allReady} onClick={() => act("game:start", { mode: "questionDebug" })}>
                Question rounds only (no board)
              </button>
              <div className="flex gap-2">
                <select
                  className="input min-h-11 flex-1 text-base"
                  aria-label="Mini-game to practice"
                  value={practice}
                  onChange={(e) => setPractice(e.target.value)}
                >
                  {clientContent.minigames
                    .filter((m) => m.enabled && MINIGAME_CLIENTS[m.id] && m.id !== "duel")
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {localize(m.name)}
                      </option>
                    ))}
                </select>
                <button
                  className="btn-secondary min-h-11 text-base"
                  disabled={!allReady}
                  onClick={() => act("game:start", { mode: "minigameDebug", minigameId: practice })}
                >
                  Play mini-games
                </button>
              </div>
            </div>
          </details>
          )}
        </section>
      )}
    </main>
  );
}

function SettingsPanel({ settings, editable, canData }: { settings: RoomSettings; editable: boolean; canData: boolean }) {
  const set = (patch: Partial<RoomSettings>) => act("room:settings", patch);
  const customCount = useStore((s) => s.pub?.customQuestions?.length ?? 0);
  return (
    <section className="card flex flex-col gap-5 p-5">
      <h2 className="flex items-center gap-2 font-display text-2xl">
        <Settings2 size={22} /> Settings {!editable && <span className="text-sm text-muted">(host decides)</span>}
      </h2>

      <div className="flex flex-col gap-2">
        <span className="font-display text-lg">Map</span>
        <MapPicker value={settings.boardId} editable={editable} onChange={(boardId) => set({ boardId })} />
      </div>

      <Row label="Win condition">
        <Segmented
          value={settings.starGoal ?? 0}
          options={GAME_CONFIG.starGoals.options.map((n) => ({ value: n, label: n === 0 ? "Most stars" : `First to ${n} ★` }))}
          disabled={!editable}
          onChange={(starGoal) => set({ starGoal })}
        />
      </Row>
      <Row label={settings.starGoal ? "Rounds (time limit)" : "Rounds"}>
        <Segmented
          value={settings.turnCount}
          options={GAME_CONFIG.turns.options.map((n) => ({ value: n, label: n === 0 ? "∞" : String(n) }))}
          disabled={!editable}
          onChange={(turnCount) => set({ turnCount })}
        />
      </Row>

      <div className="flex flex-col gap-2">
        <span className="font-display text-lg">Question packs</span>
        <PackPicker value={settings.packs} editable={editable} customCount={customCount} onChange={(packs) => set({ packs })} />
      </div>

      <details className="rounded-2xl bg-bg-2 p-3">
        <summary className="cursor-pointer font-display text-lg">
          Tile mix{" "}
          <span className="text-sm text-muted">
            {Object.keys(settings.tileFrequency ?? {}).length ? `(${Object.keys(settings.tileFrequency).length} changed)` : "(as designed)"}
          </span>
        </summary>
        <div className="mt-3">
          <TileMix value={settings.tileFrequency ?? {}} editable={editable} onChange={(tileFrequency) => set({ tileFrequency })} />
        </div>
      </details>

      <details className="rounded-2xl bg-bg-2 p-3">
        <summary className="cursor-pointer font-display text-lg">
          Mini-game mix{" "}
          <span className="text-sm text-muted">
            {Object.keys(settings.minigameMix ?? {}).length ? `(${Object.keys(settings.minigameMix ?? {}).length} changed)` : "(all normal)"}
          </span>
        </summary>
        <div className="mt-3">
          <MinigameMix value={settings.minigameMix ?? {}} editable={editable} onChange={(minigameMix) => set({ minigameMix })} />
        </div>
      </details>

      <Toggle
        label="Family-friendly (no spicy questions)"
        value={settings.familyFriendly}
        disabled={!editable}
        onChange={(familyFriendly) => set({ familyFriendly })}
      />
      {canData && (
        <Toggle
          label="Data questions"
          value={settings.dataQuestions}
          disabled={!editable}
          onChange={(dataQuestions) => set({ dataQuestions })}
        />
      )}
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

function HubSettingsPanel({ settings, editable, playerCount }: { settings: RoomSettings; editable: boolean; playerCount: number }) {
  const set = (patch: RoomSettingsPatch) => act("room:settings", patch as never);
  const O = HUB_SETTING_OPTIONS;
  const gameId = settings.gameId;
  const hub = settings.hub;
  const n = Math.max(2, playerCount);
  return (
    <section className="card flex flex-col gap-5 p-5" data-testid="hub-settings">
      <h2 className="flex items-center gap-2 font-display text-2xl">
        <Settings2 size={22} /> Settings {!editable && <span className="text-sm text-muted">(host decides)</span>}
      </h2>
      {gameId === "spygrid" && (
        <Row label="Timers">
          <Segmented
            value={hub.spygrid.pace}
            options={O.spygridPace.map((v) => ({ value: v, label: { fast: "Fast", normal: "Normal", relaxed: "Relaxed", off: "None" }[v] }))}
            disabled={!editable}
            onChange={(pace) => set({ hub: { spygrid: { pace } } })}
          />
        </Row>
      )}
      {gameId === "spectrum" && (
        <Row label={`Clues each (${n * hub.spectrum.cluesEach} rounds)`}>
          <Segmented
            value={hub.spectrum.cluesEach}
            options={O.spectrumCluesEach.map((v) => ({ value: v, label: String(v) }))}
            disabled={!editable}
            onChange={(cluesEach) => set({ hub: { spectrum: { cluesEach } } })}
          />
        </Row>
      )}
      {gameId === "bluff" && (
        <>
          <Row label={`Rounds per player (${n * hub.bluff.roundsEach} rounds)`}>
            <Segmented
              value={hub.bluff.roundsEach}
              options={O.bluffRoundsEach.map((v) => ({ value: v, label: String(v) }))}
              disabled={!editable}
              onChange={(roundsEach) => set({ hub: { bluff: { roundsEach } } })}
            />
          </Row>
          <Toggle
            label="Family-friendly (no spicy prompts)"
            value={settings.familyFriendly}
            disabled={!editable}
            onChange={(familyFriendly) => set({ familyFriendly })}
          />
        </>
      )}
      {gameId === "whowrote" && (
        <>
          <Row label={`Questions (${n} answers each to guess)`}>
            <Segmented
              value={hub.whowrote?.rounds ?? 3}
              options={O.whowroteRounds.map((v) => ({ value: v, label: String(v) }))}
              disabled={!editable}
              onChange={(rounds) => set({ hub: { whowrote: { rounds } } })}
            />
          </Row>
          <Toggle
            label="Family-friendly (no spicy questions)"
            value={settings.familyFriendly}
            disabled={!editable}
            onChange={(familyFriendly) => set({ familyFriendly })}
          />
        </>
      )}
      {gameId === "countup" && (
        <Row label="Levels to clear">
          <Segmented
            value={hub.countup?.levels ?? 8}
            options={O.countupLevels.map((v) => ({ value: v, label: String(v) }))}
            disabled={!editable}
            onChange={(levels) => set({ hub: { countup: { levels } } })}
          />
        </Row>
      )}
      {gameId === "oddword" && (
        <Row label="Rounds">
          <Segmented
            value={hub.oddword?.rounds ?? 5}
            options={O.oddwordRounds.map((v) => ({ value: v, label: String(v) }))}
            disabled={!editable}
            onChange={(rounds) => set({ hub: { oddword: { rounds } } })}
          />
        </Row>
      )}
      {gameId === "cluecrew" && (
        <Row label="Cards in the deck">
          <Segmented
            value={hub.cluecrew?.cards ?? 13}
            options={O.cluecrewCards.map((v) => ({ value: v, label: String(v) }))}
            disabled={!editable}
            onChange={(cards) => set({ hub: { cluecrew: { cards } } })}
          />
        </Row>
      )}
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
