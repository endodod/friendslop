import { defineVoteGame, scoreJudge } from "../kit/voteGame";

/** Judge's Call: each round one player is the judge; match their pick. */
export const judgesCall = defineVoteGame({ id: "judges-call", selfVote: true, judge: true, score: scoreJudge });
