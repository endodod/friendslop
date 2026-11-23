"use client";
import type { MinigameClientProps } from "../kit/types";
import { VoteClient } from "../kit/VoteClient";
import type { VotePublic } from "../kit/voteGame";

export function UnderdogClient(p: MinigameClientProps<VotePublic, { myVote: string | null }>) {
  return (
    <VoteClient
      {...p}
      opts={{ tone: "#2fd6d0", hint: () => "Pick who the FEWEST others will pick (but someone has to).", noWinner: "All tied. No underdog this time!" }}
    />
  );
}
