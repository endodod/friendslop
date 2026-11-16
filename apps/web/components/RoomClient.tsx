"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PLAYER_COLORS } from "@party-game/shared";
import { ColorPicker } from "./ColorPicker";
import { Lobby } from "./lobby/Lobby";
import { GameScreen } from "./game/GameScreen";
import { ConnectionBadge, Toasts } from "./ui";
import { useRoom } from "@/lib/useRoom";
import { useStore } from "@/lib/store";
import { saveColor, saveName, savedColor, savedName } from "@/lib/session";
import { SfxBridge } from "./SfxBridge";

export function RoomClient({ code, display }: { code: string; display: boolean }) {
  const { status, error, join, leave } = useRoom(code, display);
  const pub = useStore((s) => s.pub);

  return (
    <>
      <Toasts />
      <ConnectionBadge />
      <SfxBridge />
      {status === "connecting" || status === "joining" || (status === "joined" && !pub) ? (
        <Center>
          <p className="font-display text-3xl animate-pulse">Connecting…</p>
        </Center>
      ) : status === "notFound" ? (
        <Center>
          <p className="font-display text-3xl">Room {code} doesn&apos;t exist</p>
          <p className="text-muted">It may have expired. Ask the host for a new code.</p>
          <Link href="/" className="btn-primary">Back</Link>
        </Center>
      ) : status === "kicked" ? (
        <Center>
          <p className="font-display text-3xl">You were removed from the room</p>
          <Link href="/" className="btn-primary">Back</Link>
        </Center>
      ) : status === "needsJoin" ? (
        <JoinForm code={code} error={error} onJoin={join} />
      ) : pub?.stage === "game" && pub.game ? (
        <GameScreen />
      ) : (
        <Lobby code={code} onLeave={leave} />
      )}
    </>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">{children}</main>;
}

function JoinForm({ code, error, onJoin }: { code: string; error: string | null; onJoin: (n: string, c?: string) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(PLAYER_COLORS[0].id);
  const [busy, setBusy] = useState(false);
  const pub = useStore((s) => s.pub);
  useEffect(() => {
    setName(savedName());
    setColor(savedColor() ?? PLAYER_COLORS[0].id);
  }, []);
  const taken = pub?.players.map((p) => p.color) ?? [];
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-4 py-8">
      <h1 className="text-center font-display text-4xl">
        Join room <span className="text-accent tracking-widest">{code}</span>
      </h1>
      <form
        className="card flex flex-col gap-4 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          saveName(name.trim());
          saveColor(color);
          await onJoin(name.trim(), color);
          setBusy(false);
        }}
      >
        <label className="flex flex-col gap-2">
          <span className="font-display text-lg">Your name</span>
          <input className="input" value={name} maxLength={16} autoFocus onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="flex flex-col gap-2">
          <span className="font-display text-lg">Your color</span>
          <ColorPicker value={color} taken={taken} onChange={setColor} />
        </div>
        <button className="btn-primary" disabled={busy || !name.trim()}>
          Join
        </button>
        {error && <p className="text-center font-semibold text-bad" role="alert">{error}</p>}
      </form>
      <Link href="/" className="btn-ghost">Back</Link>
    </main>
  );
}
