import { defineVoteGame, scoreHallOfFame } from "../kit/voteGame";

/** Hall of Fame: no voting for yourself; every vote you get is a point, backing the winner is another. */
export const hallOfFame = defineVoteGame({ id: "hall-of-fame", selfVote: false, score: scoreHallOfFame });
