"use client";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { GAME_CONFIG, colorHex, type Board, type PublicGameState } from "@party-game/shared";
import { clientContent } from "@party-game/content";
import { onGameEvent, useStore } from "@/lib/store";
import { play } from "@/lib/sfx";
import { photoUrl } from "@/lib/account";
import { initials, type PlayerLike } from "../ui";

const W = 1600;
const TILE_R = 34;

/** Each map gets its own accent so boards feel distinct (like the mini-game arenas). */
const BOARD_TONES: Record<string, string> = {
  classic: "#7b5cff",
  "figure-eight": "#3d8bff",
  ladder: "#2fd27a",
  metropolis: "#ff8a3d",
  orbit: "#b26bff",
};
const toneOf = (id: string) => BOARD_TONES[id] ?? "#7b5cff";

/** Tiny deterministic RNG so scenery doesn't move between renders. */
function seeded(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Decorative bits (sparkles, pebbles) scattered where there are no tiles. */
function scenery(board: Board, H: number) {
  const rng = seeded(board.id);
  const pts = board.tiles.map((t) => ({ x: t.x * W, y: t.y * H }));
  const out: { x: number; y: number; kind: "spark" | "dot" | "ring"; s: number; o: number }[] = [];
  for (let tries = 0; tries < 400 && out.length < 46; tries++) {
    const x = 30 + rng() * (W - 60);
    const y = 30 + rng() * (H - 60);
    if (pts.some((p) => Math.hypot(p.x - x, p.y - y) < 95)) continue;
    const r = rng();
    out.push({ x, y, kind: r < 0.35 ? "spark" : r < 0.8 ? "dot" : "ring", s: 0.6 + rng() * 0.9, o: 0.12 + rng() * 0.25 });
  }
  return out;
}

interface Props {
  board: Board;
  game: PublicGameState;
  players: Record<string, PlayerLike>;
  /** Zoom in on the active player (small screens). */
  follow?: boolean;
  /** Tiles the viewer may click (junction choice). */
  selectable?: string[];
  onSelect?: (tileId: string) => void;
  className?: string;
}

const LANDING_BEAT_MS = 450;

/** Token positions as displayed (lag behind server state while hop animations play). */
function useDisplayedPositions(game: PublicGameState) {
  const [pos, setPos] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.values(game.players).map((p) => [p.id, p.tileId])),
  );
  const [hopping, setHopping] = useState<string | null>(null);
  const queue = useRef<{ playerId: string; path: string[] }[]>([]);
  const animating = useRef(false);
  const target = useRef(game);
  target.current = game;

  useEffect(() => {
    let release: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      if (animating.current) return;
      const next = queue.current.shift();
      if (!next) {
        // settle on server truth
        setPos(Object.fromEntries(Object.values(target.current.players).map((p) => [p.id, p.tileId])));
        setHopping(null);
        // A short beat on the landing tile before any full-screen phase (mini-game, question) takes over.
        release = setTimeout(() => useStore.setState({ boardBusy: false }), LANDING_BEAT_MS);
        return;
      }
      if (release) clearTimeout(release);
      useStore.setState({ boardBusy: true });
      animating.current = true;
      setHopping(next.playerId);
      let i = 0;
      const step = () => {
        if (i >= next.path.length) {
          animating.current = false;
          run();
          return;
        }
        const tile = next.path[i++];
        setPos((p) => ({ ...p, [next.playerId]: tile }));
        play("hop", { rate: 0.9 + Math.random() * 0.25, volume: 0.5 });
        setTimeout(step, GAME_CONFIG.timers.hopMs);
      };
      step();
    };
    const off = onGameEvent((e) => {
      if (e.type === "tokenMoved") {
        queue.current.push({ playerId: e.playerId, path: e.path });
        run();
      } else if (e.type === "tokenTeleported") {
        setPos((p) => ({ ...p, [e.playerId]: e.tileId }));
      }
    });
    return () => {
      off();
      if (release) clearTimeout(release);
      useStore.setState({ boardBusy: false });
    };
  }, []);

  // When no animation is running, follow the server state (reconnects, new games).
  useEffect(() => {
    if (!animating.current && queue.current.length === 0) {
      setPos(Object.fromEntries(Object.values(game.players).map((p) => [p.id, p.tileId])));
    }
  }, [game]);

  return { pos, hopping };
}

export function BoardView({ board, game, players, follow, selectable = [], onSelect, className = "" }: Props) {
  const H = W / board.aspect;
  const reduced = useReducedMotion();
  const tiles = useMemo(() => new Map(board.tiles.map((t) => [t.id, t])), [board]);
  const { pos, hopping } = useDisplayedPositions(game);
  const activeId = game.order[game.activeIndex];
  const xy = (id: string) => {
    const t = tiles.get(id);
    return t ? { x: t.x * W, y: t.y * H } : { x: 0, y: 0 };
  };

  // Camera
  const focusTile = pos[hopping ?? activeId] ?? board.startTileId;
  const zoom = follow ? 1.9 : 1;
  const f = xy(focusTile);
  const camX = follow ? Math.min(0, Math.max(W - W * zoom, W / 2 - f.x * zoom)) : 0;
  const camY = follow ? Math.min(0, Math.max(H - H * zoom, H / 2 - f.y * zoom)) : 0;

  // Tokens on the same tile are fanned out.
  const byTile = new Map<string, string[]>();
  for (const pid of game.order) {
    const t = pos[pid];
    if (!t) continue;
    byTile.set(t, [...(byTile.get(t) ?? []), pid]);
  }

  const star = xy(game.starTileId);
  const tone = toneOf(board.id);
  const decor = useMemo(() => scenery(board, H), [board, H]);
  const edges = useMemo(
    () => board.tiles.flatMap((t) => t.next.map((n) => [t.id, n] as const)),
    [board],
  );
  const activeTile = pos[activeId];
  const steppedOn = hopping ? pos[hopping] : null;

  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-[28px] ${className}`}
      style={{
        background: `radial-gradient(120% 90% at 50% 0%, ${tone}38 0%, transparent 60%), radial-gradient(80% 60% at 50% 110%, ${tone}22 0%, transparent 70%), radial-gradient(#ffffff10 1.2px, transparent 1.3px) 0 0 / 22px 22px, linear-gradient(180deg, #1d1838 0%, #120f24 100%)`,
        boxShadow: `inset 0 0 0 2px ${tone}55, inset 0 -18px 40px #00000055, 0 10px 30px #00000066`,
      }}
    >
    <div
      aria-hidden
      className="anim-drift pointer-events-none absolute -inset-[20%]"
      style={{ background: `radial-gradient(35% 30% at 30% 35%, ${tone}26, transparent 70%), radial-gradient(30% 25% at 72% 70%, #ff6bc61a, transparent 70%)` }}
    />
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="relative h-full w-full select-none"
      role="img"
      aria-label="Game board"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <radialGradient id="tileShine" cx="35%" cy="28%" r="75%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="45%" stopColor="#fff" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.25" />
        </radialGradient>
        <radialGradient id="tokenShine" cx="35%" cy="25%" r="80%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.6" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.2" />
        </radialGradient>
        <radialGradient id="starGlow">
          <stop offset="0%" stopColor="#ffe066" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ffe066" stopOpacity="0" />
        </radialGradient>
      </defs>
      <motion.g
        initial={false}
        animate={{ x: camX, y: camY, scale: zoom }}
        transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 60, damping: 18 }}
        style={{ originX: 0, originY: 0 }}
      >
        {/* scenery */}
        <g pointerEvents="none">
          {decor.map((d, i) =>
            d.kind === "spark" ? (
              <g key={i} transform={`translate(${d.x} ${d.y}) scale(${d.s})`}>
                <path
                  d="M0 -14 L3 -3 L14 0 L3 3 L0 14 L-3 3 L-14 0 L-3 -3 Z"
                  fill={tone}
                  className="anim-twinkle"
                  style={{ ["--tw-o" as string]: d.o + 0.1, animationDelay: `${-(i * 0.73) % 3.6}s`, animationDuration: `${3 + (i % 5) * 0.5}s` }}
                />
              </g>
            ) : d.kind === "ring" ? (
              <circle key={i} cx={d.x} cy={d.y} r={10 * d.s} fill="none" stroke="#fff" strokeWidth={3} opacity={d.o} />
            ) : (
              <circle
                key={i}
                cx={d.x}
                cy={d.y}
                r={5 * d.s}
                fill="#fff"
                className={i % 3 === 0 ? "anim-twinkle" : undefined}
                style={i % 3 === 0 ? { ["--tw-o" as string]: d.o, animationDelay: `${-(i * 0.41) % 3.6}s` } : { opacity: d.o }}
              />
            ),
          )}
        </g>
        {/* track bed: a soft island under every path. Opacity sits on the groups, not the lines, so
            overlapping line caps at tiles don't add up into a bright halo around every tile. */}
        <g pointerEvents="none" strokeLinecap="round">
          <g opacity={0.13}>
            {edges.map(([a0, b0]) => {
              const a = xy(a0);
              const b = xy(b0);
              return <line key={`bed-${a0}-${b0}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={tone} strokeWidth={100} />;
            })}
          </g>
          <g opacity={0.55}>
            {edges.map(([a0, b0]) => {
              const a = xy(a0);
              const b = xy(b0);
              return <line key={`bed2-${a0}-${b0}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#0d0b1a" strokeWidth={72} />;
            })}
          </g>
        </g>
        {/* roads: dark edge, surface, dashed centre line */}
        <g strokeLinecap="round">
          {edges.map(([a0, b0]) => {
            const a = xy(a0);
            const b = xy(b0);
            return <line key={`edge-${a0}-${b0}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#0d0b1a" strokeWidth={30} />;
          })}
          {edges.map(([a0, b0]) => {
            const a = xy(a0);
            const b = xy(b0);
            const sel = selectable.includes(b0);
            return (
              <line key={`road-${a0}-${b0}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={sel ? "#ffc933" : "#433c72"} strokeWidth={sel ? 24 : 20} />
            );
          })}
          {edges.map(([a0, b0]) => {
            const a = xy(a0);
            const b = xy(b0);
            return (
              <line key={`mid-${a0}-${b0}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ffffff" strokeOpacity={0.16} strokeWidth={3} strokeDasharray="10 14" className="anim-flow" />
            );
          })}
        </g>
        {/* where the active player stands */}
        {activeTile && game.phase !== "podium" && (
          <motion.circle
            cx={xy(activeTile).x}
            cy={xy(activeTile).y}
            r={TILE_R + 16}
            fill={colorHex(players[activeId]?.color ?? "")}
            opacity={0.25}
            animate={reduced ? undefined : { r: [TILE_R + 10, TILE_R + 24, TILE_R + 10], opacity: [0.35, 0.12, 0.35] }}
            transition={{ repeat: Infinity, duration: 1.6 }}
            pointerEvents="none"
          />
        )}
        {/* direction arrows only at intersections: right next to the junction tile, one per way out */}
        {board.tiles.flatMap((t) =>
          t.next.map((n) => {
            if (t.next.length < 2) return null;
            const sel = selectable.includes(n);
            const a = xy(t.id);
            const b = xy(n);
            const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            const d = TILE_R + 22; // just outside the junction tile (and its dashed ring)
            const x = a.x + ((b.x - a.x) / len) * d;
            const y = a.y + ((b.y - a.y) / len) * d;
            const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
            return (
              <g
                key={`arrow-${t.id}-${n}`}
                transform={`translate(${x} ${y}) rotate(${angle}) scale(${sel ? 1.5 : 1.2})`}
                pointerEvents="none"
              >
                <path
                  d="M -7 -10 L 6 0 L -7 10"
                  fill="none"
                  stroke={sel ? "#14112a" : "#ffc933"}
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          }),
        )}
        {/* tiles */}
        {board.tiles.map((t, idx) => {
          const type = game.tileTypes[t.id] ?? t.type;
          const def = clientContent.tiles.find((d) => d.id === type);
          const { x, y } = xy(t.id);
          const isSel = selectable.includes(t.id);
          const junction = t.next.length > 1;
          return (
            <g
              key={t.id}
              transform={`translate(${x} ${y})`}
              onClick={isSel ? () => onSelect?.(t.id) : undefined}
              style={{ cursor: isSel ? "pointer" : undefined }}
              role={isSel ? "button" : undefined}
              aria-label={isSel ? `Go towards ${typeof def?.name === "string" ? def.name : type} tile` : undefined}
            >
              {isSel && (
                <motion.circle
                  r={TILE_R + 18}
                  fill="none"
                  stroke="#ffc933"
                  strokeWidth={6}
                  animate={reduced ? undefined : { scale: [1, 1.15, 1], opacity: [1, 0.5, 1] }}
                  transition={{ repeat: Infinity, duration: 1 }}
                />
              )}
              {junction && <circle r={TILE_R + 9} fill="none" stroke="#f4f1ff66" strokeWidth={4} strokeDasharray="6 8" className="anim-spin-slow" />}
              {/* chunky 3D disc: dark base, coloured top, shine, rim. Pops in once, squashes when stepped on. */}
              <motion.g
                initial={reduced ? false : { scale: 0, opacity: 0 }}
                animate={
                  steppedOn === t.id && !reduced
                    ? { scale: [1, 0.86, 1.06, 1], opacity: 1 }
                    : { scale: 1, opacity: 1 }
                }
                transition={
                  steppedOn === t.id
                    ? { duration: 0.32 }
                    : { delay: Math.min(0.6, idx * 0.012), type: "spring", stiffness: 420, damping: 18 }
                }
              >
              <ellipse cx={0} cy={13} rx={TILE_R + 2} ry={TILE_R - 4} fill="#000" opacity={0.35} />
              <circle cy={7} r={TILE_R} fill={def?.color ?? "#888"} />
              <circle cy={7} r={TILE_R} fill="#000" opacity={0.35} />
              <circle r={TILE_R} fill={def?.color ?? "#888"} />
              <circle r={TILE_R} fill="url(#tileShine)" />
              <circle r={TILE_R - 1.5} fill="none" stroke="#14112a" strokeOpacity={0.55} strokeWidth={3} />
              <circle r={TILE_R - 7} fill="none" stroke="#ffffff" strokeOpacity={0.3} strokeWidth={2.5} />
              <image href={`/icons/${def?.icon ?? "question"}.svg`} x={-20} y={-21} width={40} height={40} opacity={0.85} />
              </motion.g>
              {def?.effect === "bank" && (
                <g transform="translate(0 50)">
                  <rect x={-30} y={-14} width={60} height={28} rx={14} fill="#14112a" stroke="#f9a8d4" strokeWidth={3} />
                  <text textAnchor="middle" dominantBaseline="central" fontFamily="Lilita One" fontSize={20} fill="#ffc933">
                    {game.bank}
                  </text>
                </g>
              )}
            </g>
          );
        })}
        {/* star */}
        {game.starTileId && (
          <motion.g
            key={game.starTileId}
            initial={reduced ? false : { scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 120, damping: 10 }}
            style={{ x: star.x, y: star.y }}
            pointerEvents="none"
          >
            <motion.circle
              r={TILE_R * 2.2}
              fill="url(#starGlow)"
              animate={reduced ? undefined : { scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
            />
            <path
              d="M0 -80 l20.9 45.6 49.9 5.6 -37.1 33.8 10.3 49.1 -44 -24.9 -44 24.9 10.3 -49.1 -37.1 -33.8 49.9 -5.6z"
              transform="translate(0 -6) scale(0.62)"
              fill="#ffe066"
              stroke="#b38a12"
              strokeWidth={6}
            />
          </motion.g>
        )}
        {/* tokens */}
        {game.order.map((pid) => {
          const p = players[pid];
          const tile = pos[pid];
          if (!p || !tile) return null;
          const group = byTile.get(tile) ?? [pid];
          const idx = group.indexOf(pid);
          const spread = group.length > 4 ? 42 : group.length > 1 ? 30 : 0;
          const angle = (idx / group.length) * Math.PI * 2 - Math.PI / 2;
          const base = xy(tile);
          const x = base.x + Math.cos(angle) * spread;
          const y = base.y + Math.sin(angle) * spread - 30;
          const active = pid === activeId;
          const hex = colorHex(p.color);
          return (
            <motion.g
              key={pid}
              initial={false}
              animate={{ x, y }}
              transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 26 }}
              pointerEvents="none"
            >
              <motion.g
                animate={hopping === pid && !reduced ? { y: [0, -28, 0] } : { y: 0 }}
                transition={hopping === pid ? { repeat: Infinity, duration: GAME_CONFIG.timers.hopMs / 1000 } : undefined}
              >
                <ellipse cx={0} cy={38} rx={22} ry={7} fill="#000" opacity={0.35} />
                {/* pin stem */}
                <path d="M -9 22 L 0 38 L 9 22 Z" fill={hex} stroke="#14112a" strokeWidth={4} strokeLinejoin="round" />
                {active && <circle r={35} fill="none" stroke="#fff" strokeWidth={5} opacity={0.95} />}
                <circle r={28} fill={hex} stroke="#14112a" strokeWidth={5} />
                <circle r={26} fill="url(#tokenShine)" />
                {active && !reduced && (
                  <motion.path
                    d="M -10 -50 L 10 -50 L 0 -38 Z"
                    fill="#fff"
                    animate={{ y: [0, -8, 0] }}
                    transition={{ repeat: Infinity, duration: 0.9 }}
                  />
                )}
                {p.photo ? (
                  <>
                    <clipPath id={`tok-${pid}`}>
                      <circle r={23} />
                    </clipPath>
                    <image
                      href={photoUrl(p.photo) ?? undefined}
                      x={-23}
                      y={-23}
                      width={46}
                      height={46}
                      clipPath={`url(#tok-${pid})`}
                      preserveAspectRatio="xMidYMid slice"
                    />
                  </>
                ) : (
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily={p.avatar ? undefined : "Lilita One"}
                  fontSize={p.avatar ? 30 : 24}
                  fill="#14112a"
                >
                  {p.avatar || initials(p.name)}
                </text>
                )}
              </motion.g>
            </motion.g>
          );
        })}
      </motion.g>
    </svg>
    </div>
  );
}
