import type { GameId } from "./types";

export type PlayMode = "ffa" | "teams" | "coop";

export const PLAY_MODES: Record<PlayMode, { label: string; short: string; icon: string }> = {
  ffa: { label: "Free-for-all", short: "Everyone for themselves", icon: "crown" },
  teams: { label: "Teams", short: "Two teams", icon: "duel" },
  coop: { label: "Co-op", short: "Everyone wins together", icon: "friends" },
};

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
  /** How people play against each other: everyone for themselves, two teams, or all together. */
  mode: PlayMode;
  /** Typical length, e.g. "20–40 min". */
  minutes: string;
  tags: string[];
  /** Tutorial (2–5 steps) shown before the game starts and in the help sheet. */
  howTo: { title: string; text: string; icon: string }[];
}

export const GAMES: GameInfo[] = [
  {
    id: "party",
    mode: "ffa",
    name: "Party Board",
    icon: "custom-dice",
    color: "#ffc933",
    tagline: "How well do you really know your friends?",
    description:
      "Roll, move and grab stars on a board full of surprises. Questions are about the players: score by guessing what your friends answer about themselves. A mini-game after every round.",
    players: { min: 2, max: 8 },
    minutes: "30–60 min",
    tags: ["Board", "Questions", "34 mini-games"],
    howTo: [],
  },
  {
    id: "spygrid",
    mode: "teams",
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
    mode: "ffa",
    name: "Spectrum",
    icon: "mind",
    color: "#3dd6c6",
    tagline: "Read your friend's mind on a sliding scale.",
    description:
      "A secret target sits somewhere between two opposites, like Cold and Hot. One player sees it and gives a clue; everyone else drags their dial to where they think it is. The closer, the more points.",
    players: { min: 2, max: 8 },
    minutes: "10–20 min",
    tags: ["Clues", "Guessing", "Quick"],
    howTo: [
      { icon: "thermometer", title: "Two opposites", text: "Each round shows a scale, like Overrated ↔ Underrated, with a hidden target somewhere on it." },
      { icon: "peek", title: "The clue-giver sees it", text: "One player sees where the target is and types a clue that sits there on the scale. Clue-givers take turns." },
      { icon: "pointing", title: "Everyone guesses", text: "Drag your dial to where you think the target is, then lock it in." },
      { icon: "perfect", title: "Scoring", text: "Bullseye 4 points, close 3, near 2. The clue-giver gets the average of everyone's points, so clear clues pay." },
    ],
  },
  {
    id: "bluff",
    mode: "ffa",
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
      { icon: "spotlight", title: "One player in the spotlight", text: "Each round asks something about one player, like \"What would Sam name a boat?\"." },
      { icon: "confessions", title: "Truth and lies", text: "They write their real answer. Everyone else writes a fake that sounds like them." },
      { icon: "magnifier", title: "Find the truth", text: "All answers are shuffled together (plus a few house lies). Pick the one you think is real." },
      { icon: "coins", title: "Scoring", text: "Find the truth: +3. Each player you fool: +2. The player in the spotlight gets +1 for everyone who found them. Tap 😂 on your favourite fake: +1 for its author." },
    ],
  },
  {
    id: "whowrote",
    mode: "ffa",
    name: "Who Wrote That?",
    icon: "open-book",
    color: "#b26bff",
    tagline: "Anonymous answers. Name the author.",
    description:
      "Everyone answers the same question about themselves, anonymously. Then the answers come up one by one and you guess who wrote each one. Know your friends, and keep a straight face when it's yours.",
    players: { min: 3, max: 8 },
    minutes: "15–25 min",
    tags: ["Writing", "Friends", "Guessing"],
    howTo: [
      { icon: "question", title: "One question for everyone", text: "Like \"Your most useless talent\". Everyone writes a true answer about themselves. Nobody sees who wrote what." },
      { icon: "spotlight", title: "One answer at a time", text: "The answers come up one by one, shuffled. Tap the friend you think wrote it." },
      { icon: "confessions", title: "Is it yours?", text: "When your own answer comes up, your phone tells you. Keep a straight face!" },
      { icon: "coins", title: "Scoring", text: "Right guess: +2. Each friend who guesses wrong on your answer: +1. Tap 😂 on a great answer: +1 for its author." },
    ],
  },
  {
    id: "countup",
    mode: "coop",
    name: "Count Up",
    icon: "number-grid",
    color: "#2fd27a",
    tagline: "Play every card in order. No talking.",
    description:
      "Everyone gets secret cards from 1 to 100. Together, play ALL of them in rising order, without saying a single number. Anyone can play at any moment, so it's all about timing. Every level deals one more card each.",
    players: { min: 2, max: 8 },
    minutes: "10–20 min",
    tags: ["Co-op", "Real-time", "Numbers"],
    howTo: [
      { icon: "number-grid", title: "Secret cards", text: "Level 1: everyone gets one card from 1 to 100. Level 2: two cards each, and so on. Only you see yours." },
      { icon: "arrows", title: "Count up together", text: "Anyone can play their lowest card at any time. The goal: every card on the pile in rising order." },
      { icon: "red-light", title: "No talking about numbers", text: "No hints, no counting out loud. Just feel the timing. Long wait = big gap." },
      { icon: "shield", title: "Lives", text: "Played while someone still held a lower card? You lose a life, and those lower cards are thrown away. Clear levels to earn extra lives." },
      { icon: "pointing", title: "Sync", text: "Stuck? Everyone raises a hand, and each player throws away their lowest card. You only have a few syncs." },
    ],
  },
  {
    id: "cluecrew",
    mode: "coop",
    name: "Clue Crew",
    icon: "friends",
    color: "#3d8bff",
    tagline: "One word each. Don't think alike!",
    description:
      "Play together, not against each other. One player guesses; everyone else sees the secret word and writes a one-word clue. Identical clues cancel out, so be helpful and original. How many of the 13 cards can your crew solve?",
    players: { min: 3, max: 8 },
    minutes: "15–20 min",
    tags: ["Co-op", "Words", "Clues"],
    howTo: [
      { icon: "friends", title: "All on one team", text: "Everyone plays together against the deck. Each card, a different player guesses." },
      { icon: "peek", title: "One clue each", text: "Everyone but the guesser sees the secret word and secretly writes one clue word (two each with only 3 players)." },
      { icon: "bomb", title: "Same clue? Both gone!", text: "Identical clues cancel out before the guesser sees them. Then the clue-givers can strike clues that are too close, like \"lava\" and \"magma\"." },
      { icon: "mind", title: "One guess", text: "The guesser gets one guess. Right: +1 card. Pass: the card is lost. Wrong: you lose that card AND the next one." },
      { icon: "trophy", title: "Beat your score", text: "Solve as many cards as you can and get your crew's rating at the end." },
    ],
  },
  {
    id: "oddword",
    mode: "ffa",
    name: "Odd Word Out",
    icon: "spotlight",
    color: "#ff4d5e",
    tagline: "Everyone has the same word. Almost everyone.",
    description:
      "Everyone gets a secret word, except one player, who gets a slightly different one and doesn't know it. Take turns giving one-word clues, then vote: who has the odd word? Hidden roles, sneaky clues and a lot of suspicion.",
    players: { min: 4, max: 8 },
    minutes: "15–25 min",
    tags: ["Hidden role", "Words", "Bluffing"],
    howTo: [
      { icon: "peek", title: "A secret word", text: "Everyone sees a word, like \"Beach\". One player secretly got a close one, like \"Pool\", and doesn't know they're the odd one out." },
      { icon: "mind", title: "One-word clues", text: "Take turns giving one clue word about your word, two laps. Too obvious helps the odd one out; too vague makes you look guilty." },
      { icon: "pointing", title: "Vote", text: "Everyone votes for the player they think has the odd word. Most votes is accused (a tie saves everyone)." },
      { icon: "enigma", title: "Last chance", text: "Caught? The odd one out sees they're caught and gets one guess at everyone else's word. Guess it and they steal the round." },
      { icon: "coins", title: "Scoring", text: "Voted for the odd one out and they're caught: +2. Odd one out not caught: +4. Caught but guessed the word: +3." },
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
