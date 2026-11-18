import type { IncomingMessage, ServerResponse } from "node:http";
import {
  AVATAR_MAX_BYTES,
  CredentialsSchema,
  CustomQuestionDraftSchema,
  GameError,
  SAVED_QUESTIONS_MAX,
  UsernameSchema,
  buildCustomQuestion,
  type CustomQuestionDraft,
  type SavedQuestion,
} from "@party-game/shared";
import { db } from "../persistence/db";
import type { User } from "../generated/prisma/client";
import {
  createSession,
  deleteSession,
  hashPassword,
  publicUserSelect,
  toPublicUser,
  userFromToken,
  verifyPassword,
} from "./auth";
import { acceptFriend, friendStatus, listFriends, removeFriend, requestFriend } from "./friends";
import { notifyFriends } from "./presence";

/**
 * REST API for accounts, profiles and friends: /api/...
 * Auth is a bearer token (kept in the browser's localStorage), not a cookie, because the web app
 * and the game server usually live on different domains.
 */

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Any origin may call the API: auth is a bearer token from the caller's own storage, never a cookie,
 * so a foreign site can't act as a user. (WEB_ORIGINS still limits the Socket.IO game connection.)
 */
function corsHeaders(_req: IncomingMessage): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "access-control-max-age": "600",
  };
}

function send(req: IncomingMessage, res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { ...corsHeaders(req), "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, "That file is too big."));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const buf = await readBody(req, 16 * 1024);
  try {
    return buf.length ? JSON.parse(buf.toString("utf8")) : {};
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}

function bearer(req: IncomingMessage): string | null {
  const h = req.headers.authorization;
  return h?.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

async function requireUser(req: IncomingMessage): Promise<User> {
  const u = await userFromToken(bearer(req));
  if (!u) throw new HttpError(401, "Please sign in again.");
  return u;
}

/** Simple fixed-window limiter for login/register per IP. */
const attempts = new Map<string, { n: number; reset: number }>();
function limitAuth(req: IncomingMessage) {
  const ip = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket.remoteAddress || "?";
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || a.reset < now) {
    attempts.set(ip, { n: 1, reset: now + 60_000 });
    if (attempts.size > 10_000) for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k);
    return;
  }
  if (++a.n > 10) throw new HttpError(429, "Too many attempts. Try again in a minute.");
}

function sniffImage(buf: Buffer): string | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

function parse<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }, v: unknown): T {
  const r = schema.safeParse(v);
  if (!r.success) throw new HttpError(400, r.error.issues[0]?.message ?? "Invalid input.");
  return r.data;
}

const promptKey = (d: CustomQuestionDraft) => d.prompt.replace(/\s+/g, " ").trim().toLowerCase();
const toSaved = (r: { id: string; draft: unknown; createdAt: Date }): SavedQuestion => ({
  id: r.id,
  draft: r.draft as CustomQuestionDraft,
  createdAt: r.createdAt.toISOString(),
});

/** Handles /api/* requests. Returns false if the URL isn't an API route. */
export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://x");
  const path = url.pathname;
  if (!path.startsWith("/api/")) return false;
  const method = req.method ?? "GET";
  if (method === "OPTIONS") {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return true;
  }
  try {
    const c = db();
    if (!c) throw new HttpError(503, "Accounts are unavailable right now (no database).");
    let m: RegExpMatchArray | null;

    // ---------------------------------------------------------------- auth
    if (path === "/api/auth/register" && method === "POST") {
      limitAuth(req);
      const { username, password } = parse(CredentialsSchema, await readJson(req));
      const key = username.toLowerCase();
      if (await c.user.findUnique({ where: { usernameKey: key }, select: { id: true } }))
        throw new HttpError(409, "That username is taken.");
      const user = await c.user.create({ data: { username, usernameKey: key, passwordHash: await hashPassword(password) } });
      return send(req, res, 200, { token: await createSession(user.id), user: toPublicUser(user) }), true;
    }
    if (path === "/api/auth/login" && method === "POST") {
      limitAuth(req);
      const body = (await readJson(req)) as { username?: unknown; password?: unknown };
      const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const user = username ? await c.user.findUnique({ where: { usernameKey: username } }) : null;
      if (!user || !(await verifyPassword(password, user.passwordHash))) throw new HttpError(401, "Wrong username or password.");
      return send(req, res, 200, { token: await createSession(user.id), user: toPublicUser(user) }), true;
    }
    if (path === "/api/auth/logout" && method === "POST") {
      const t = bearer(req);
      if (t) await deleteSession(t);
      return send(req, res, 200, { ok: true }), true;
    }

    // ---------------------------------------------------------------- me
    if (path === "/api/me" && method === "GET") {
      const u = await requireUser(req);
      return send(req, res, 200, { user: toPublicUser(u) }), true;
    }
    if (path === "/api/me/avatar" && method === "PUT") {
      const u = await requireUser(req);
      const buf = await readBody(req, AVATAR_MAX_BYTES);
      const mime = sniffImage(buf);
      if (!mime) throw new HttpError(415, "Please upload a JPEG, PNG or WebP image.");
      const updated = await c.user.update({
        where: { id: u.id },
        data: { avatarData: new Uint8Array(buf), avatarMime: mime, avatarVersion: { increment: 1 } },
        select: publicUserSelect,
      });
      void notifyFriends(u.id);
      return send(req, res, 200, { user: toPublicUser(updated) }), true;
    }
    if (path === "/api/me/avatar" && method === "DELETE") {
      const u = await requireUser(req);
      // The version counter stays monotonic so a later upload never reuses a cached URL.
      const updated = await c.user.update({
        where: { id: u.id },
        data: { avatarData: null, avatarMime: null },
        select: publicUserSelect,
      });
      return send(req, res, 200, { user: toPublicUser(updated) }), true;
    }

    // ---------------------------------------------------------------- saved custom questions
    if (path === "/api/me/questions" && method === "GET") {
      const u = await requireUser(req);
      const rows = await c.savedQuestion.findMany({ where: { userId: u.id }, orderBy: { createdAt: "asc" } });
      return send(req, res, 200, { questions: rows.map(toSaved) }), true;
    }
    if (path === "/api/me/questions" && method === "POST") {
      const u = await requireUser(req);
      const body = (await readJson(req)) as { questions?: unknown };
      // One or many (importing questions saved on a device).
      const raw = Array.isArray(body.questions) ? body.questions.slice(0, SAVED_QUESTIONS_MAX) : [body.questions];
      const drafts = raw.map((d) => parse(CustomQuestionDraftSchema, d));
      for (const d of drafts) {
        try {
          buildCustomQuestion(d, "check"); // same rules as adding it to a room
        } catch (e) {
          throw new HttpError(400, e instanceof GameError ? e.message : "Invalid question.");
        }
      }
      const have = await c.savedQuestion.count({ where: { userId: u.id } });
      if (have + drafts.length > SAVED_QUESTIONS_MAX)
        throw new HttpError(400, `You can save up to ${SAVED_QUESTIONS_MAX} questions. Delete some first.`);
      await c.savedQuestion.createMany({
        data: drafts.map((d) => ({ userId: u.id, promptKey: promptKey(d), draft: d as object })),
        skipDuplicates: true,
      });
      const rows = await c.savedQuestion.findMany({ where: { userId: u.id }, orderBy: { createdAt: "asc" } });
      return send(req, res, 200, { questions: rows.map(toSaved) }), true;
    }
    if ((m = path.match(/^\/api\/me\/questions\/([A-Za-z0-9_-]{1,40})$/)) && method === "DELETE") {
      const u = await requireUser(req);
      await c.savedQuestion.deleteMany({ where: { id: m[1], userId: u.id } });
      return send(req, res, 200, { ok: true }), true;
    }

    // ---------------------------------------------------------------- users
    if ((m = path.match(/^\/api\/users\/([A-Za-z0-9_-]{1,40})\/avatar$/)) && method === "GET") {
      const u = await c.user.findUnique({ where: { id: m[1] }, select: { avatarData: true, avatarMime: true } });
      if (!u?.avatarData || !u.avatarMime) {
        res.writeHead(404, corsHeaders(req));
        res.end();
        return true;
      }
      res.writeHead(200, {
        ...corsHeaders(req),
        "content-type": u.avatarMime,
        "content-length": String(u.avatarData.length),
        // URLs carry ?v=<version>, so a new upload gets a new URL.
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'",
        "cross-origin-resource-policy": "cross-origin",
      });
      res.end(Buffer.from(u.avatarData));
      return true;
    }
    if ((m = path.match(/^\/api\/users\/by-name\/([^/]+)$/)) && method === "GET") {
      const name = parse(UsernameSchema, decodeURIComponent(m[1]));
      const u = await c.user.findUnique({ where: { usernameKey: name.toLowerCase() }, select: publicUserSelect });
      if (!u) throw new HttpError(404, "No player with that username.");
      const viewer = await userFromToken(bearer(req));
      const status = viewer ? await friendStatus(c, viewer.id, u.id) : "none";
      return send(req, res, 200, { user: toPublicUser(u), friendStatus: status }), true;
    }

    // ---------------------------------------------------------------- friends
    if (path === "/api/friends" && method === "GET") {
      const u = await requireUser(req);
      return send(req, res, 200, { friends: await listFriends(c, u.id) }), true;
    }
    if (path === "/api/friends" && method === "POST") {
      const u = await requireUser(req);
      const body = (await readJson(req)) as { username?: unknown; userId?: unknown };
      let targetId: string | null = null;
      if (typeof body.userId === "string") {
        targetId = (await c.user.findUnique({ where: { id: body.userId }, select: { id: true } }))?.id ?? null;
      } else {
        const name = parse(UsernameSchema, body.username);
        targetId = (await c.user.findUnique({ where: { usernameKey: name.toLowerCase() }, select: { id: true } }))?.id ?? null;
      }
      if (!targetId) throw new HttpError(404, "No player with that username.");
      if (targetId === u.id) throw new HttpError(400, "You can't add yourself.");
      return send(req, res, 200, { status: await requestFriend(c, u.id, targetId) }), true;
    }
    if ((m = path.match(/^\/api\/friends\/([A-Za-z0-9_-]{1,40})\/accept$/)) && method === "POST") {
      const u = await requireUser(req);
      if (!(await acceptFriend(c, u.id, m[1]))) throw new HttpError(404, "That friend request is gone.");
      return send(req, res, 200, { status: "friends" }), true;
    }
    if ((m = path.match(/^\/api\/friends\/([A-Za-z0-9_-]{1,40})$/)) && method === "DELETE") {
      const u = await requireUser(req);
      await removeFriend(c, u.id, m[1]);
      return send(req, res, 200, { status: "none" }), true;
    }

    throw new HttpError(404, "Not found.");
  } catch (e) {
    if (e instanceof HttpError) send(req, res, e.status, { message: e.message });
    else {
      console.error("[api]", e);
      send(req, res, 500, { message: "Something went wrong." });
    }
    return true;
  }
}
