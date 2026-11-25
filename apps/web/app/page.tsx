"use client";
import { motion } from "framer-motion";
import { Monitor, Smartphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BRANDING, GAMES, PLAYER_COLORS, gameInfo, type GameId, type JoinResult } from "@party-game/shared";
import { GameCard } from "@/components/lobby/GamePicker";
import { AvatarPicker } from "@/components/AvatarPicker";
import { ColorPicker } from "@/components/ColorPicker";
import { Icon, Toasts } from "@/components/ui";
import { ServerStatus } from "@/components/ServerStatus";
import { AccountChip } from "@/components/account/AccountChip";
import { useAccount } from "@/lib/account";
import { getSocket, send } from "@/lib/socket";
import { profileToken, saveGame, savedGame, saveUsePhoto, savedUsePhoto, saveAvatar, saveColor, saveName, saveSeat, savedAvatar, savedColor, savedName } from "@/lib/session";

export default function Landing() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(PLAYER_COLORS[0].id);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const username = useAccount((s) => s.user?.username);
  const accountPhoto = useAccount((s) => s.user?.photo ?? null);
  const [usePhoto, setUsePhoto] = useState(true);
  const [gameId, setGameId] = useState<GameId>("party");
  const game = gameInfo(gameId);
  // Signed in without a saved name: play under the username.
  useEffect(() => {
    if (username) setName((n) => n || username);
  }, [username]);

  useEffect(() => {
    setName((n) => n || savedName());
    setColor(savedColor() ?? PLAYER_COLORS[Math.floor(Math.random() * 4)].id);
    setAvatar(savedAvatar());
    setUsePhoto(savedUsePhoto());
    const last = savedGame();
    if (last) setGameId(last);
    getSocket();
  }, []);

  async function create(role: "player" | "display") {
    if (role === "player" && !name.trim()) return setError("Enter your name first.");
    setBusy(true);
    setError(null);
    saveName(name.trim());
    saveColor(color);
    saveAvatar(avatar);
    saveGame(gameId);
    const res = await send("room:create", { role, name: role === "player" ? name.trim() : undefined, color, avatar, profileToken: profileToken(), usePhoto, gameId });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    const r = res as unknown as JoinResult;
    saveSeat({ code: r.code, token: r.token, role: r.role, playerId: r.playerId });
    router.push(role === "display" ? `/r/${r.code}?display=1` : `/r/${r.code}`);
  }

  function join(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length !== 4) return setError("Room codes have 4 letters.");
    if (name.trim()) {
      saveName(name.trim());
      saveColor(color);
      saveAvatar(avatar);
    }
    router.push(`/r/${c}`);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-6 px-4 py-8">
      <Toasts />
      <ServerStatus />
      <div className="-mb-2 flex justify-end">
        <AccountChip />
      </div>
      <motion.header initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-center">
        <div className="mx-auto mb-3 flex w-fit gap-2">
          {GAMES.map((g, k) => (
            <motion.span
              key={g.id}
              animate={{ y: [0, -6, 0] }}
              transition={{ repeat: Infinity, duration: 1.6, delay: k * 0.15 }}
              style={{ color: g.color }}
            >
              <Icon id={g.icon} size={34} />
            </motion.span>
          ))}
        </div>
        <h1 className="anim-float font-display text-5xl text-accent drop-shadow-[0_4px_0_#7a5a00] sm:text-6xl">{BRANDING.name}</h1>
        <p className="mt-2 text-muted">{BRANDING.tagline}</p>
      </motion.header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="order-2 flex flex-col gap-3 lg:order-1" aria-labelledby="games-heading">
          <h2 id="games-heading" className="font-display text-3xl">Pick a game</h2>
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Games">
            {GAMES.map((g) => (
              <GameCard key={g.id} info={g} selected={g.id === gameId} onSelect={() => setGameId(g.id)} />
            ))}
          </div>
          <motion.div key={gameId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card flex flex-col gap-3 p-5" data-testid="create-panel">
            <p className="text-sm leading-snug text-muted">{game.description}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="btn-primary" disabled={busy} onClick={() => create("player")} data-testid="create-room">
                <Smartphone size={20} /> Create room & play
              </button>
              <button className="btn-secondary" disabled={busy} onClick={() => create("display")}>
                <Monitor size={20} /> On a shared screen (TV)
              </button>
            </div>
            <p className="text-xs text-muted">
              Same room? Open a shared screen on the TV, everyone joins with their phone. Playing online? Everyone just joins on their own
              device. You can switch games in the lobby any time.
            </p>
          </motion.div>
        </section>

        {/* Phones: joining a friend's room comes first. */}
        <div className="order-1 flex flex-col gap-6 lg:order-2">
          <section className="card flex flex-col gap-3 p-5">
            <h2 className="font-display text-2xl">Join a room</h2>
            <form onSubmit={join} className="flex gap-2">
              <input
                className="input min-w-0 text-center font-display text-2xl tracking-[0.4em] uppercase"
                value={code}
                maxLength={4}
                placeholder="ABCD"
                aria-label="Room code"
                autoCapitalize="characters"
                onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase())}
              />
              <button className="btn-primary" type="submit" disabled={code.length !== 4}>
                Join
              </button>
            </form>
          </section>

          <section className="card flex flex-col gap-4 p-5">
            <label className="flex flex-col gap-2">
              <span className="font-display text-lg">Your name</span>
              <input
                className="input"
                value={name}
                maxLength={16}
                autoComplete="nickname"
                placeholder="e.g. Sam"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="flex flex-col gap-2">
              <span className="font-display text-lg">Your color</span>
              <ColorPicker value={color} onChange={setColor} />
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-display text-lg">Your icon</span>
              <AvatarPicker
                value={avatar}
                color={color}
                name={name}
                onChange={(a) => {
                  setAvatar(a);
                  setUsePhoto(false);
                  saveUsePhoto(false);
                }}
                photo={accountPhoto}
                usePhoto={usePhoto}
                onUsePhoto={() => {
                  setUsePhoto(true);
                  saveUsePhoto(true);
                }}
              />
            </div>
          </section>
        </div>
      </div>

      {error && <p className="rounded-2xl bg-bad/20 p-3 text-center font-semibold text-bad" role="alert">{error}</p>}

      <footer className="mt-auto text-center text-sm text-muted">
        <Link href="/credits" className="underline">Credits & licenses</Link>
      </footer>
    </main>
  );
}
