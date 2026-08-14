import type { NextApiRequest, NextApiResponse } from "next";
import {
  clearFailedLogins,
  clearedCookie,
  clientKey,
  createSession,
  loginAllowed,
  passwordMatches,
  registerFailedLogin,
  sessionCookie,
} from "@/lib/operatorAuth";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", clearedCookie());
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "POST") return res.status(405).end();

  // Tek ortak sifre sozluk saldirisina acik: para geri alan bir panelde
  // deneme sayisi sinirsiz birakilamaz.
  const now = Date.now();
  const key = clientKey(req);
  const limit = loginAllowed(key, now);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    return res.status(429).json({
      error: `Çok fazla hatalı deneme. ${Math.ceil(limit.retryAfter / 60)} dakika sonra tekrar deneyin`,
    });
  }

  const { password } = (req.body ?? {}) as Record<string, unknown>;
  if (!passwordMatches(password)) {
    registerFailedLogin(key, now);
    return res.status(401).json({ error: "Şifre hatalı" });
  }

  clearFailedLogins(key);
  res.setHeader("Set-Cookie", sessionCookie(createSession(now)));
  return res.status(200).json({ ok: true });
}
