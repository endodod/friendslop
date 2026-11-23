import { defineVoteGame, scoreUnderdog } from "../kit/voteGame";

/** Underdog: score by backing the player with the fewest votes. */
export const underdog = defineVoteGame({ id: "underdog", selfVote: true, score: scoreUnderdog });
