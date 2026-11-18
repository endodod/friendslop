"use client";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { GAME_CONFIG, colorHex, type Board, type PublicGameState } from "@party-game/shared";
import { clientContent } from "@party-game/content";
import { onGameEvent } from "@/lib/store";
import { play } from "@/lib/sfx";
import { initials, type PlayerLike } from "../ui";

const W = 1600;
const TILE_R = 34;

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
    const run = () => {
      if (animating.current) return;
      const next = queue.current.shift();
      if (!next) {
        // settle on server truth
        setPos(Object.fromEntries(Object.values(target.current.players).map((p) => [p.id, p.tileId])));
        setHopping(null);
        return;
      }
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
    return onGameEvent((e) => {
      if (e.type === "tokenMoved") {
        queue.current.push({ playerId: e.playerId, path: e.path });
        run();
      } else if (e.type === "tokenTeleported") {
        setPos((p) => ({ ...p, [e.playerId]: e.tileId }));
      }
    });
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

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`h-full w-full select-none ${className}`}
      role="img"
      aria-label="Game board"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <radialGradient id="starGlow">
          <stop offset="0%" stopColor="#ffe066" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ffe066" stopOpacity="0" />
        </radialGradient>
        <filter id="tileShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="6" stdDeviation="0" floodColor="#000" floodOpacity="0.35" />
        </filter>
      </defs>
      <motion.g
        initial={false}
        animate={{ x: camX, y: camY, scale: zoom }}
        transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 60, damping: 18 }}
        style={{ originX: 0, originY: 0 }}
      >
        {/* paths */}
        {board.tiles.flatMap((t) =>
          t.next.map((n) => {
            const a = xy(t.id);
            const b = xy(n);
            const branch = t.next.length > 1;
            return (
              <line
                key={`${t.id}-${n}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={selectable.includes(n) ? "#ffc933" : "#3a3462"}
                strokeWidth={selectable.includes(n) ? 16 : 12}
                strokeLinecap="round"
                strokeDasharray={branch && !selectable.includes(n) ? "1 0" : undefined}
              />
            );
          }),
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
        {board.tiles.map((t) => {
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
              {junction && <circle r={TILE_R + 8} fill="none" stroke="#f4f1ff55" strokeWidth={4} strokeDasharray="6 8" />}
              <circle r={TILE_R} fill={def?.color ?? "#888"} filter="url(#tileShadow)" />
              <circle r={TILE_R - 5} fill="none" stroke="#ffffff40" strokeWidth={3} />
              <image href={`/icons/${def?.icon ?? "question"}.svg`} x={-20} y={-20} width={40} height={40} opacity={0.82} />
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
                <ellipse cx={0} cy={36} rx={22} ry={7} fill="#000" opacity={0.3} />
                {active && <circle r={34} fill="none" stroke="#fff" strokeWidth={5} opacity={0.9} />}
                <circle r={28} fill={hex} stroke="#14112a" strokeWidth={5} />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontFamily="Lilita One"
                  fontSize={24}
                  fill="#14112a"
                >
                  {initials(p.name)}
                </text>
              </motion.g>
            </motion.g>
          );
        })}
      </motion.g>
    </svg>
  );
}
