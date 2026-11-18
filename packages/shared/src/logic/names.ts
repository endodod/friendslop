/**
 * Offensive-name check for the "cursed dice" mechanic: players whose room name or account username
 * contains a slur, hate reference or swear word keep their name, but their dice only roll 1–3.
 * Chat is not filtered.
 *
 * Matching:
 * - The name is lower-cased, accents are stripped and leetspeak is undone (1→i, 3→e, 4/@→a, 0→o, 5/$→s, 7→t).
 * - Every letter of a listed word may repeat ("niiigger"), and separators are ignored for ANYWHERE words
 *   ("N.i.g_g.3.r"), so they are found anywhere in the name.
 * - WHOLE words are short or ambiguous: they only count as a separate word or as the whole name
 *   ("coon" curses, "Raccoon" doesn't).
 * - ALLOW lists clean words that contain an ANYWHERE word; they're removed before checking.
 */

/** Found anywhere in the name, even inside other words. */
const ANYWHERE = [
  // racial / ethnic slurs
  "nigg", "nigger", "niggah", "nigr", "wetback", "raghead", "towelhead", "porchmonkey", "junglebunny", "zipperhead",
  "golliwog", "sandnigger", "tarbaby",
  // sexuality / gender / disability
  "faggot", "fagot", "tranny", "shemale", "retard",
  // hate references
  "hitler", "nazi", "siegheil", "seigheil", "whitepower", "gasthejews", "holohoax", "heilhitler",
  // German
  "neger", "kanake", "zigeuner", "kameltreiber", "schwuchtel", "judensau",
  // swearing
  "fuck", "shit", "cunt", "whore", "slut", "bitch", "motherfuck", "wichser", "hurensohn", "fotze", "scheisse",
];

/** Only as a separate word (or the whole name). */
const WHOLE = [
  // racial / ethnic slurs
  "nig", "coon", "spic", "spick", "kike", "chink", "gook", "jap", "beaner", "paki", "wog", "wop", "dago", "gyppo", "gypsy",
  "abo", "kaffir", "kafir", "coolie", "redskin",
  // sexuality / gender / disability
  "fag", "fags", "dyke", "spaz", "spast", "mong", "mongo", "cripple", "tard",
  // hate references
  "kkk",
  // German
  "behindi", "behindert", "spasti",
  // swearing
  "fuk", "dick", "cock", "twat", "wanker", "prick", "piss", "arsch", "arschloch",
];

/** Clean words that contain an ANYWHERE word. */
const ALLOW = ["snigger", "retardant", "nazir", "nazim", "ashkenazi", "scunthorpe", "shiitake", "shitake"];

const LEET: Record<string, string> = { "1": "i", "!": "i", "|": "i", "3": "e", "4": "a", "@": "a", "0": "o", "5": "s", $: "s", "7": "t", "9": "g" };

function normalize(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[1!|3@4057$9]/g, (c) => LEET[c] ?? c);
}

/** "nigger" → /n+i+g+g+e+r+/ so stretched spellings still match. */
const stretch = (w: string) => w.split("").map((c) => `${c}+`).join("");
const ANYWHERE_RE = new RegExp(ANYWHERE.map(stretch).join("|"));
const WHOLE_RE = new RegExp(`^(?:${WHOLE.map(stretch).join("|")})$`);
const ALLOW_RE = new RegExp(ALLOW.join("|"), "g");

/** Does this name contain a slur, hate reference or swear word? */
export function isOffensiveName(name: string | null | undefined): boolean {
  if (!name) return false;
  // Hate numbers are checked before leetspeak turns them into letters.
  if (/14\W*88/.test(name)) return true;
  const norm = normalize(name);
  const joined = norm.replace(/[^a-z]/g, "").replace(ALLOW_RE, "");
  if (ANYWHERE_RE.test(joined)) return true;
  const words = norm.split(/[^a-z]+/).filter(Boolean);
  // Whole words, plus the whole name with separators removed ("c.o.o.n").
  return words.some((w) => WHOLE_RE.test(w)) || WHOLE_RE.test(norm.replace(/[^a-z]/g, ""));
}

/** Cursed players' dice only show 1 to this. */
export const CURSED_DICE_MAX = 3;
