"use client";
import type { MinigameClientProps } from "../kit/types";
import { VoteClient } from "../kit/VoteClient";
import type { VotePublic } from "../kit/voteGame";

export function HallOfFameClient(p: MinigameClientProps<VotePublic, { myVote: string | null }>) {
  return (
    <VoteClient
      {...p}
      opts={{ tone: "#ffc933", hint: () => "You can't vote for yourself. Every vote you get is a point.", noWinner: "No clear winner, but every vote still counts." }}
    />
  );
}
