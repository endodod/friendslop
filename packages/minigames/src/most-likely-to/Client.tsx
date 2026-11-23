"use client";
import type { MinigameClientProps } from "../kit/types";
import { VoteClient } from "../kit/VoteClient";
import type { VotePublic } from "../kit/voteGame";

export function MostLikelyToClient(p: MinigameClientProps<VotePublic, { myVote: string | null }>) {
  return <VoteClient {...p} opts={{ tone: "#ff6bc6", noWinner: "No majority. Nobody scores!" }} />;
}
