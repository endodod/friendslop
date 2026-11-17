"use client";
import { Check } from "lucide-react";
import { localize, type Board } from "@party-game/shared";
import { clientContent } from "@party-game/content";
import { useBoards } from "@/lib/board";

/** Tiny SVG of a board: paths + colored tiles. */
export function BoardPreview({ board, className = "" }: { board: Board; className?: string }) {
  const W = 160;
  const H = W / board.aspect;
  const pos = new Map(board.tiles.map((t) => [t.id, { x: t.x * W, y: t.y * H }]));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden>
      {board.tiles.flatMap((t) =>
        t.next.map((n) => {
          const a = pos.get(t.id)!;
          const b = pos.get(n)!;
          return <line key={`${t.id}-${n}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#3a3462" strokeWidth={2} />;
        }),
      )}
      {board.tiles.flatMap((t) =>
        t.next.map((n) => {
          const a = pos.get(t.id)!;
          const b = pos.get(n)!;
          const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
          return (
            <path
              key={`arr-${t.id}-${n}`}
              d="M -1.6 -2 L 1.4 0 L -1.6 2"
              fill="none"
              stroke={t.next.length > 1 ? "#ffc933" : "#8f87c4"}
              strokeWidth={0.9}
              strokeLinecap="round"
              transform={`translate(${(a.x + b.x) / 2} ${(a.y + b.y) / 2}) rotate(${angle})`}
            />
          );
        }),
      )}
      {board.tiles.map((t) => {
        const p = pos.get(t.id)!;
        const def = clientContent.tiles.find((d) => d.id === t.type);
        return <circle key={t.id} cx={p.x} cy={p.y} r={t.next.length > 1 ? 4.5 : 3.6} fill={def?.color ?? "#888"} stroke={t.next.length > 1 ? "#fff" : "none"} strokeWidth={1} />;
      })}
    </svg>
  );
}

export function MapPicker({ value, editable, onChange }: { value: string; editable: boolean; onChange: (id: string) => void }) {
  const boards = useBoards();
  if (!boards) return <p className="text-muted">Loading maps…</p>;
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-3" role="radiogroup" aria-label="Map">
      {boards.map((b) => {
        const on = b.id === value;
        const junctions = b.tiles.filter((t) => t.next.length > 1).length;
        return (
          <button
            key={b.id}
            role="radio"
            aria-checked={on}
            disabled={!editable && !on}
            onClick={() => editable && onChange(b.id)}
            className={`relative flex flex-col gap-1 rounded-2xl p-2 text-left transition-all ${
              on ? "bg-panel-2 ring-2 ring-accent" : "bg-bg-2 opacity-80 hover:opacity-100"
            } disabled:opacity-35`}
          >
            {on && (
              <span className="absolute right-2 top-2 rounded-full bg-accent p-0.5 text-[#241a00]">
                <Check size={14} strokeWidth={4} />
              </span>
            )}
            <BoardPreview board={b} className="w-full rounded-xl bg-bg/60" />
            <span className="font-display text-base leading-tight">{localize(b.name)}</span>
            <span className="text-xs text-muted">
              {b.tiles.length} tiles · {junctions} {junctions === 1 ? "junction" : "junctions"}
            </span>
            {b.recommendedPlayers && (
              <span className="self-start rounded-full bg-accent/20 px-2 text-xs font-semibold text-accent">
                {b.recommendedPlayers.min}–{b.recommendedPlayers.max} players
              </span>
            )}
            {b.description && <span className="text-xs leading-snug text-muted">{localize(b.description)}</span>}
          </button>
        );
      })}
    </div>
  );
}
