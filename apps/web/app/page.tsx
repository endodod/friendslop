"use client";
import { motion } from "framer-motion";
import { Monitor, Smartphone } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BRANDING, PLAYER_COLORS, type JoinResult } from "@party-game/shared";
import { AvatarPicker } from "@/components/AvatarPicker";
import { ColorPicker } from "@/components/ColorPicker";
import { Icon, Toasts } from "@/components/ui";
import { ServerStatus } from "@/components/ServerStatus";
import { getSocket, send } from "@/lib/socket";
import { profileToken, saveAvatar, saveColor, saveName, saveSeat, savedAvatar, savedColor, savedName } from "@/lib/session";

export default function Landing() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(PLAYER_COLORS[0].id);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName((n) => n || savedName());
    setColor(savedColor() ?? PLAYER_COLORS[Math.floor(Math.random() * 4)].id);
    setAvatar(savedAvatar());
    getSocket();
  }, []);

  async function create(role: "player" | "display") {
    if (role === "player" && !name.trim()) return setError("Enter your name first.");
    setBusy(true);
    setError(null);
    saveName(name.trim());
    saveColor(color);
    saveAvatar(avatar);
    const res = await send("room:create", { role, name: role === "player" ? name.trim() : undefined, color, avatar, profileToken: profileToken() });
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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-8">
      <Toasts />
      <ServerStatus />
      <motion.header initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-center">
        <div className="mx-auto mb-3 flex w-fit gap-2">
          {["food", "music", "gaming", "hot-takes"].map((i, k) => (
            <motion.span key={i} animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 1.6, delay: k * 0.15 }}>
              <Icon id={i} size={34} className={["text-[#ff8a3d]", "text-[#ff6bc6]", "text-[#3d8bff]", "text-[#ff4d5e]"][k]} />
            </motion.span>
          ))}
        </div>
        <h1 className="anim-float font-display text-5xl text-accent drop-shadow-[0_4px_0_#7a5a00]">{BRANDING.name}</h1>
        <p className="mt-2 text-muted">{BRANDING.tagline}</p>
      </motion.header>

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
          <AvatarPicker value={avatar} color={color} name={name} onChange={setAvatar} />
        </div>
      </section>

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="font-display text-2xl">Join a room</h2>
        <form onSubmit={join} className="flex gap-2">
          <input
            className="input text-center font-display text-2xl tracking-[0.4em] uppercase"
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

      <section className="card flex flex-col gap-3 p-5">
        <h2 className="font-display text-2xl">New game</h2>
        <button className="btn-primary" disabled={busy} onClick={() => create("player")}>
          <Smartphone size={20} /> Create room & play
        </button>
        <button className="btn-secondary" disabled={busy} onClick={() => create("display")}>
          <Monitor size={20} /> Create on a shared screen (TV)
        </button>
        <p className="text-sm text-muted">
          Same room? Open a shared screen on the TV, everyone joins with their phone. Playing online? Everyone just joins
          on their own device.
        </p>
      </section>

      {error && <p className="rounded-2xl bg-bad/20 p-3 text-center font-semibold text-bad" role="alert">{error}</p>}

      <footer className="mt-auto text-center text-sm text-muted">
        <Link href="/credits" className="underline">Credits & licenses</Link>
      </footer>
    </main>
  );
}
