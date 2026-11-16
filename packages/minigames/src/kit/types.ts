import type { ComponentType, ReactNode } from "react";
import type { Answer, PlayerId, PublicQuestionRound } from "@party-game/shared";

export interface KitPlayer {
  id: PlayerId;
  name: string;
  color: string;
}

/** UI pieces the web app injects so mini-games look consistent without depending on apps/web. */
export interface MinigameUiKit {
  Avatar: ComponentType<{ player: KitPlayer | undefined; size?: number; ring?: boolean; dim?: boolean }>;
  /** Full question round UI (intro/answer/reveal/results) */
  QuestionRound: ComponentType<{
    round: PublicQuestionRound;
    display?: boolean;
    myAnswer: Answer | null;
    onAnswer: (a: Answer) => Promise<unknown>;
    totalAnswerMs?: number;
  }>;
  Icon: ComponentType<{ id: string; size?: number; className?: string }>;
  /** Format-specific answer input (tiles, number slider, player picker, …). */
  AnswerInput: ComponentType<{ question: PublicQuestionRound["question"]; value: Answer | null; onChange: (a: Answer) => void }>;
  /** Compact rendering of an answer. */
  AnswerLabel: ComponentType<{ question: PublicQuestionRound["question"]; answer: Answer | null | undefined; big?: boolean }>;
  Timer: ComponentType<{ endsAt: number | null; totalMs?: number }>;
  play: (sfx: string, opts?: { volume?: number; rate?: number }) => void;
  vibrate: (pattern: number | number[]) => void;
}

/** Props every mini-game client component receives. */
export interface MinigameClientProps<Pub = any, Priv = any> {
  pub: Pub;
  priv: Priv | null;
  /** Shared seed (solo games build the same layout from it). */
  seed: number | null;
  me: PlayerId | null;
  isParticipant: boolean;
  participants: PlayerId[];
  players: Record<PlayerId, KitPlayer>;
  bonus: boolean;
  startedAt: number;
  endsAt: number;
  /** Server-synced clock. */
  now: () => number;
  /** Realtime / turn-based input (validated server-side). */
  input: (i: unknown) => void;
  /** Solo result submission. */
  submit: (s: unknown) => void;
  display: boolean;
  ui: MinigameUiKit;
}

export type MinigameClient = ComponentType<MinigameClientProps>;

export interface ClientEntry {
  Component: MinigameClient;
  /** Optional custom results line per player. */
  resultLabel?: (score: number | undefined) => ReactNode;
}
