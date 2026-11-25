import type { GameId } from "./types";

/** Everything the hub page, lobby and tutorials show about a game. */
export interface GameInfo {
  id: GameId;
  name: string;
  /** game-icons.net id in apps/web/public/icons. */
  icon: string;
  /** Hex accent of the game card. */
  color: string;
  tagline: string;
  description: string;
  players: { min: number; max: number };
  /** Typical length, e.g. "20–40 min". */
  minutes: string;
  tags: string[];
  /** Tutorial (2–5 steps) shown before the game starts and in the help sheet. */
  howTo: { title: string; text: string; icon: string }[];
}

export const GAMES: GameInfo[] = [
  {
    id: "party",
    name: "Party Board",
    icon: "custom-dice",
    color: "#ffc933",
    tagline: "How well do you really know your friends?",
    description:
      "Roll, move and grab stars on a board full of surprises. Questions are about the players: score by guessing what your friends answer about themselves. A mini-game after every round.",
    players: { min: 3, max: 8 },
    minutes: "30–60 min",
    tags: ["Board", "Questions", "33 mini-games"],
    howTo: [],
  },
  {
    id: "spygrid",
    name: "Spy Grid",
    icon: "magnifier",
    color: "#ff8a3d",
    tagline: "One word, many meanings. Find your agents.",
    description:
      "Two teams, one grid of 25 words. Your team's clue-giver knows which words are your agents and gives one-word clues. Find all of yours before the other team, and never touch the trap.",
    players: { min: 4, max: 8 },
    minutes: "15–25 min",
    tags: ["Teams", "Words", "Clues"],
    howTo: [
      { icon: "friends", title: "Two teams", text: "Foxes vs Owls. Each team has one clue-giver; everyone else guesses." },
      { icon: "peek", title: "The secret key", text: "Only the clue-givers see which words belong to which team, which are bystanders, and which one is the trap." },
      { icon: "mind", title: "One word + a number", text: "On your turn, the clue-giver types one word and how many grid words it points to, like \"ocean 2\"." },
      { icon: "pointing", title: "Guess together", text: "Guessers tap a word to vote. When most of the team agrees, it's revealed. Hit yours to keep going (up to the number + 1); a bystander or the other team's word ends the turn." },
      { icon: "skull", title: "Avoid the trap", text: "Reveal the trap and your team loses on the spot. Find all your agents first to win." },
    ],
  },
  {
    id: "spectrum",
    name: "Spectrum",
    icon: "mind",
    color: "#3dd6c6",
    tagline: "Read your friend's mind on a sliding scale.",
    description:
      "A secret target sits somewhere from 1 to 10 between two opposites, like Cold and Hot. One player sees it and gives a clue; everyone else guesses the number. The closer, the more points.",
    players: { min: 2, max: 8 },
    minutes: "10–20 min",
    tags: ["Clues", "Guessing", "Quick"],
    howTo: [
      { icon: "thermometer", title: "Two opposites", text: "Each round shows a 1–10 scale, like Overrated ↔ Underrated, with a hidden target number on it." },
      { icon: "peek", title: "The clue-giver sees it", text: "One player sees where the target is and types a clue that sits there on the scale. Clue-givers take turns." },
      { icon: "pointing", title: "Everyone guesses", text: "Pick a number from 1 to 10 where you think the target is, then lock it in." },
      { icon: "perfect", title: "Scoring", text: "Exact hit 4 points, one off 2, two off 1. The clue-giver gets the average of everyone's points, so clear clues pay." },
    ],
  },
  {
    id: "bluff",
    name: "Bluff Club",
    icon: "enigma",
    color: "#ff6bc6",
    tagline: "Fake your friend's answer. Spot the real one.",
    description:
      "Every round is about one player. They write the real answer, everyone else writes a convincing fake. Then find the truth among the lies, and fool your friends with yours.",
    players: { min: 3, max: 8 },
    minutes: "15–30 min",
    tags: ["Writing", "Bluffing", "Friends"],
    howTo: [
      { icon: "spotlight", title: "One player in the spotlight", text: "Each round asks something about one player, like \"What would your friend name a boat?\"." },
      { icon: "confessions", title: "Truth and lies", text: "They write their real answer. Everyone else writes a fake that sounds like them." },
      { icon: "magnifier", title: "Find the truth", text: "All answers are shuffled together (plus a few house lies). Pick the one you think is real." },
      { icon: "coins", title: "Scoring", text: "Find the truth: +3. Each player you fool: +2. The player in the spotlight gets +1 for everyone who found them. Tap 😂 on your favourite fake: +1 for its author." },
    ],
  },
];

export function gameInfo(id: GameId | undefined | null): GameInfo {
  return GAMES.find((g) => g.id === id) ?? GAMES[0];
}

export const TEAM_INFO = {
  a: { id: "a" as const, name: "Foxes", emoji: "🦊", color: "#ff8a3d" },
  b: { id: "b" as const, name: "Owls", emoji: "🦉", color: "#8a7dff" },
};
