import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextApiRequest } from "next";
import type { IncomingMessage } from "node:http";

/**
 * İptal ekraninin kapisi. Demo seviyesi: tek ortak sifre, imzali oturum cerezi.
 * Produksiyonda kullanici bazli yetkilendirme + islem kaydi gerekir (bkz. IPTAL-IADE-PLAN.md).
 */

const COOKIE_NAME = "iptal_oturum";
const SESSION_MS = 30 * 60 * 1000;

function password(): string {
  const value = process.env.CANCEL_PANEL_PASSWORD;
  if (!value) throw new Error("CANCEL_PANEL_PASSWORD tanımlı değil");
  return value;
}

/** Sifre tanimli degilse sayfa 500 yerine kurulum uyarisi gostersin. */
export function isConfigured(): boolean {
  return Boolean(process.env.CANCEL_PANEL_PASSWORD);
}

/** Uzunluk farki timingSafeEqual'i firlatir; karsilastirmadan once elenmeli. */
function equals(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function sign(expiresAt: number): string {
  return createHmac("sha256", password()).update(String(expiresAt)).digest("base64url");
}

export function passwordMatches(input: unknown): boolean {
  return typeof input === "string" && equals(input, password());
}

/** Cerez degeri: `bitis.imza`. Sifre degisince eski imzalar kendiliginden gecersizlesir. */
export function createSession(now: number): string {
  const expiresAt = now + SESSION_MS;
  return `${expiresAt}.${sign(expiresAt)}`;
}

export function sessionCookie(token: string): string {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Strict",
    `Max-Age=${SESSION_MS / 1000}`,
  ];

  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function clearedCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0`;
}

function readCookie(header: string | undefined): string | null {
  if (!header) return null;

  for (const chunk of header.split(";")) {
    const [name, ...rest] = chunk.trim().split("=");
    if (name === COOKIE_NAME) return rest.join("=");
  }

  return null;
}

export function hasSession(req: NextApiRequest | IncomingMessage, now: number): boolean {
  const token = readCookie(req.headers.cookie);
  if (!token) return false;

  const [rawExpiry, signature] = token.split(".");
  const expiresAt = Number(rawExpiry);
  if (!Number.isFinite(expiresAt) || expiresAt <= now || !signature) return false;

  return equals(signature, sign(expiresAt));
}

const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const MAX_TRACKED = 500;

type Attempts = { count: number; startedAt: number };

// Sayac globalThis'te: API route bundle'i her derlemede yeniden yuklenirse
// sayac sifirlanmamali. Tek sunucu icin yeterli; birden fazla ornekte paylasimli
// bir depo (Redis vb.) gerekir — bkz. IPTAL-IADE-PLAN.md.
const globalStore = globalThis as typeof globalThis & { __paynkolayLogin?: Map<string, Attempts> };
const attempts: Map<string, Attempts> = (globalStore.__paynkolayLogin ??= new Map());

/**
 * Istemci adresi. `x-forwarded-for` yalnizca guvenilen bir proxy arkasindayken
 * anlamlidir; dogrudan acik bir sunucuda istemci bu basligi uydurabilir ve
 * sayaci atlatir. Produksiyonda proxy'nin bu basligi ezmesi sart.
 */
export function clientKey(req: NextApiRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  return (first ?? req.socket.remoteAddress ?? "bilinmeyen").trim();
}

/** Suresi dolmus kayitlar birikmesin; harita yalnizca dolunca taranir. */
function sweep(now: number): void {
  for (const [key, entry] of attempts) {
    if (now - entry.startedAt >= ATTEMPT_WINDOW_MS) attempts.delete(key);
  }
}

export function loginAllowed(key: string, now: number): { allowed: boolean; retryAfter: number } {
  const entry = attempts.get(key);
  if (!entry || now - entry.startedAt >= ATTEMPT_WINDOW_MS) return { allowed: true, retryAfter: 0 };

  if (entry.count < MAX_ATTEMPTS) return { allowed: true, retryAfter: 0 };

  const remaining = ATTEMPT_WINDOW_MS - (now - entry.startedAt);
  return { allowed: false, retryAfter: Math.ceil(remaining / 1000) };
}

/** Yanlis sifre sayilir. Pencere ilk hatadan baslar; dogru sifre sayaci siler. */
export function registerFailedLogin(key: string, now: number): void {
  if (attempts.size >= MAX_TRACKED) sweep(now);

  const entry = attempts.get(key);
  if (!entry || now - entry.startedAt >= ATTEMPT_WINDOW_MS) {
    attempts.set(key, { count: 1, startedAt: now });
    return;
  }

  entry.count += 1;
}

export function clearFailedLogins(key: string): void {
  attempts.delete(key);
}
