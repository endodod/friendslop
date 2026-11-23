"use client";
import type { MinigameClientProps } from "../kit/types";
import { VoteClient } from "../kit/VoteClient";
import type { VotePublic } from "../kit/voteGame";

export function JudgesCallClient(p: MinigameClientProps<VotePublic, { myVote: string | null }>) {
  return <VoteClient {...p} opts={{ tone: "#818cf8", noWinner: "The judge didn't vote. Nobody scores!" }} />;
}
