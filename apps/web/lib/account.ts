"use client";
import { create } from "zustand";
import { type CustomQuestionDraft, type FriendEntry, type FriendStatus, type PublicUser, type SavedQuestion } from "@party-game/shared";
import { getSocket, serverUrl } from "./socket";
import { sessionToken, setSessionToken } from "./session";

/** Absolute URL for a server path such as a profile picture. */
export function photoUrl(path: string | null | undefined): string | null {
  return path ? `${serverUrl()}${path}` : null;
}

export type ApiResult<T> = ({ ok: true } & T) | { ok: false; status: number; message: string };

/** Call the game server's account API. Never throws. */
export async function api<T>(path: string, init: { method?: string; json?: unknown; body?: BodyInit; contentType?: string } = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  const token = sessionToken();
  if (token) headers.authorization = `Bearer ${token}`;
  let body = init.body;
  if (init.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.json);
  } else if (init.contentType) headers["content-type"] = init.contentType;
  try {
    const res = await fetch(`${serverUrl()}/api${path}`, { method: init.method ?? "GET", headers, body, cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      // Session expired or was revoked elsewhere.
      if (res.status === 401 && token) useAccount.getState().signedOut();
      return { ok: false, status: res.status, message: String(data.message ?? "Something went wrong.") };
    }
    return { ok: true, ...(data as T) };
  } catch {
    return { ok: false, status: 0, message: "Can't reach the game server." };
  }
}

interface AccountStore {
  user: PublicUser | null;
  /** false until the stored session was checked */
  loaded: boolean;
  /** Accounts unavailable (server has no database). */
  unavailable: boolean;
  friends: FriendEntry[];
  /** Custom questions saved on the profile (null = not loaded yet). */
  questions: SavedQuestion[] | null;
  setUser(u: PublicUser | null): void;
  signedOut(): void;
}

export const useAccount = create<AccountStore>((set) => ({
  user: null,
  loaded: false,
  unavailable: false,
  friends: [],
  questions: null,
  setUser: (user) => set({ user }),
  signedOut: () => {
    setSessionToken(null);
    set({ user: null, friends: [], questions: null });
    identifySocket();
  },
}));

/** Tell the game server which account this browser's socket belongs to. */
export function identifySocket() {
  const s = getSocket();
  if (s.connected) s.emit("auth:identify", { token: sessionToken() }, () => {});
}

let loading: Promise<void> | null = null;
/** Load the signed-in user once per page load. */
export function loadAccount(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    if (!sessionToken()) {
      useAccount.setState({ loaded: true });
      return;
    }
    const res = await api<{ user: PublicUser }>("/me");
    if (res.ok) useAccount.setState({ user: res.user, loaded: true });
    else useAccount.setState({ loaded: true, unavailable: res.status === 503 });
    if (res.ok) void refreshFriends();
  })();
  return loading;
}

export async function signIn(mode: "login" | "register", username: string, password: string): Promise<string | null> {
  const res = await api<{ token: string; user: PublicUser }>(`/auth/${mode}`, { method: "POST", json: { username, password } });
  if (!res.ok) return res.message;
  setSessionToken(res.token);
  useAccount.setState({ user: res.user, loaded: true });
  identifySocket();
  void refreshFriends();
  return null;
}

export async function signOut() {
  await api("/auth/logout", { method: "POST" });
  useAccount.getState().signedOut();
}

export async function refreshFriends() {
  if (!sessionToken()) return;
  const res = await api<{ friends: FriendEntry[] }>("/friends");
  if (res.ok) useAccount.setState({ friends: res.friends });
}

export async function addFriend(by: { username: string } | { userId: string }): Promise<ApiResult<{ status: FriendStatus }>> {
  const res = await api<{ status: FriendStatus }>("/friends", { method: "POST", json: by });
  if (res.ok) void refreshFriends();
  return res;
}
export async function acceptFriend(userId: string) {
  const res = await api(`/friends/${userId}/accept`, { method: "POST" });
  void refreshFriends();
  return res;
}
export async function removeFriend(userId: string) {
  const res = await api(`/friends/${userId}`, { method: "DELETE" });
  void refreshFriends();
  return res;
}

/** Center-crop and shrink an image file to a small square WebP/JPEG before uploading. */
export async function resizeImage(file: File, size: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close?.();
  const toBlob = (type: string) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.85));
  // Safari can't encode WebP and silently returns PNG; that's fine too.
  const blob = (await toBlob("image/webp")) ?? (await toBlob("image/jpeg"));
  if (!blob) throw new Error("Couldn't read that image.");
  return blob;
}

// --- saved custom questions -----------------------------------------------------------------
export async function loadSavedQuestions(): Promise<SavedQuestion[]> {
  const res = await api<{ questions: SavedQuestion[] }>("/me/questions");
  if (res.ok) useAccount.setState({ questions: res.questions });
  return res.ok ? res.questions : [];
}

/** Save one or more questions to the profile. Returns an error message or null. */
export async function saveQuestions(drafts: CustomQuestionDraft[]): Promise<string | null> {
  const res = await api<{ questions: SavedQuestion[] }>("/me/questions", { method: "POST", json: { questions: drafts } });
  if (!res.ok) return res.message;
  useAccount.setState({ questions: res.questions });
  return null;
}

export async function deleteSavedQuestion(id: string) {
  useAccount.setState((s) => ({ questions: s.questions?.filter((q) => q.id !== id) ?? null }));
  await api(`/me/questions/${id}`, { method: "DELETE" });
}

export const promptKey = (prompt: string) => prompt.replace(/\s+/g, " ").trim().toLowerCase();
