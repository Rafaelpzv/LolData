import { NextRequest, NextResponse } from "next/server";

import { getTeamBySlug } from "@/lib/premade/repository";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  SESSION_TTL_MS,
  clearFailures,
  clientIp,
  cookieName,
  getAttempt,
  getCredentials,
  hashPassword,
  newSalt,
  readSession,
  registerFailure,
  savePassword,
  signSession,
  verifyPassword,
} from "@/lib/premade/edit-session";

/** Escreve no Supabase: nunca cacheado. */
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ slug: string }>;
}

/**
 * POST /api/premade/[slug]/password
 *   { password }              entra: confere a senha e emite o cookie de edicao
 *   { password, set: true }   define/troca a senha (exige a sessao atual quando ja existe uma)
 *   { revoke: true }          encerra esta sessao (a senha continua)
 * GET  -> { locked, hasPassword }: se a pagina deve mostrar o pedido de senha.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const team = await getTeamBySlug(slug).catch(() => null);
  if (!team) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const credentials = await getCredentials(team.id);
  const hasPassword = Boolean(credentials?.passwordHash);
  const token = cookieValue(request, cookieName(team.id));
  const unlocked = !hasPassword || readSession(token, team.id, credentials?.version ?? 0);
  return NextResponse.json({ hasPassword, unlocked });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const team = await getTeamBySlug(slug).catch(() => null);
  if (!team) return NextResponse.json({ error: "notFound" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as
    | { password?: unknown; set?: unknown; revoke?: unknown }
    | null;
  if (!body) return NextResponse.json({ error: "invalidBody" }, { status: 400 });

  const credentials = await getCredentials(team.id);
  const cookie = cookieName(team.id);
  const unlockedNow = readSession(cookieValue(request, cookie), team.id, credentials?.version ?? 0);

  if (body.revoke === true) {
    return clearCookie(NextResponse.json({ ok: true }), cookie);
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return NextResponse.json({ error: "passwordLength" }, { status: 422 });
  }

  // Definir/trocar a senha: a primeira vez nao pede nada, depois exige a sessao atual.
  if (body.set === true) {
    if (credentials?.passwordHash && !unlockedNow) {
      return NextResponse.json({ error: "locked" }, { status: 401 });
    }
    const salt = newSalt();
    const hash = await hashPassword(password, salt);
    const version = await savePassword(team.id, hash, salt);
    const response = NextResponse.json({ ok: true, version });
    return setCookie(response, cookie, signSession(team.id, version, Date.now() + SESSION_TTL_MS));
  }

  // Entrar: bloqueio temporario antes de qualquer comparacao de hash.
  const ip = clientIp(request);
  const attempt = await getAttempt(team.id, ip);
  if (attempt.blocked) {
    return NextResponse.json({ error: "blocked", retryAfter: attempt.retryAfterSeconds }, { status: 429 });
  }
  if (!credentials?.passwordHash || !credentials.salt) {
    // Equipe sem senha: nada a conferir, entra direto e a pagina mostra o aviso de definir uma.
    const response = NextResponse.json({ ok: true, hasPassword: false });
    return setCookie(response, cookie, signSession(team.id, credentials?.version ?? 0, Date.now() + SESSION_TTL_MS));
  }
  if (!(await verifyPassword(password, credentials.salt, credentials.passwordHash))) {
    await registerFailure(team.id, ip);
    return NextResponse.json({ error: "wrongPassword" }, { status: 401 });
  }

  await clearFailures(team.id, ip);
  const response = NextResponse.json({ ok: true, hasPassword: true });
  return setCookie(response, cookie, signSession(team.id, credentials.version, Date.now() + SESSION_TTL_MS));
}

function cookieValue(request: NextRequest, name: string): string | undefined {
  return request.cookies.get(name)?.value;
}

/** HttpOnly: a pagina le o estado pelo GET, nunca pelo cookie. */
function setCookie<T extends NextResponse>(response: T, name: string, value: string): T {
  response.cookies.set({
    name,
    value,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1_000),
  });
  return response;
}

function clearCookie<T extends NextResponse>(response: T, name: string): T {
  response.cookies.set({ name, value: "", httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
