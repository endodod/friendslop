import { defineVoteGame, scoreMajority, type VotePublic } from "../kit/voteGame";

export { majorityOf, VOTE_MS } from "../kit/voteGame";
export type MltPublic = VotePublic;

/** Most Likely To: vote with the majority. */
export const mostLikelyTo = defineVoteGame({ id: "most-likely-to", selfVote: true, score: scoreMajority });
