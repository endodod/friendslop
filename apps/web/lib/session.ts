import { BRANDING } from "@party-game/shared";

const P = BRANDING.storagePrefix;

export interface StoredSeat {
  code: string;
  token: string;
  role: "player" | "display";
  playerId?: string;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, val: string | null) {
  try {
    if (val === null) localStorage.removeItem(key);
    else localStorage.setItem(key, val);
  } catch {
    /* private mode */
  }
}

export function getSeat(code: string): StoredSeat | null {
  const raw = safeGet(`${P}:seat:${code.toUpperCase()}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSeat;
  } catch {
    return null;
  }
}
export function saveSeat(seat: StoredSeat) {
  safeSet(`${P}:seat:${seat.code.toUpperCase()}`, JSON.stringify(seat));
}
export function clearSeat(code: string) {
  safeSet(`${P}:seat:${code.toUpperCase()}`, null);
}

/** Anonymous profile id (persists across rooms). */
export function profileToken(): string {
  let t = safeGet(`${P}:profile`);
  if (!t) {
    t = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
    safeSet(`${P}:profile`, t);
  }
  return t;
}

export function savedName(): string {
  return safeGet(`${P}:name`) ?? "";
}
export function saveName(name: string) {
  safeSet(`${P}:name`, name);
}
export function savedColor(): string | undefined {
  return safeGet(`${P}:color`) ?? undefined;
}
export function saveColor(c: string) {
  safeSet(`${P}:color`, c);
}
export function savedAvatar(): string | null {
  return safeGet(`${P}:avatar`) || null;
}
export function saveAvatar(a: string | null) {
  safeSet(`${P}:avatar`, a ?? "");
}
export function getMuted(): boolean {
  return safeGet(`${P}:muted`) === "1";
}
export function setMutedStored(m: boolean) {
  safeSet(`${P}:muted`, m ? "1" : "0");
}

/** Bearer token of the signed-in account (null = guest). */
export function sessionToken(): string | null {
  return safeGet(`${P}:session`);
}
export function setSessionToken(t: string | null) {
  safeSet(`${P}:session`, t);
}
