// Senha de edicao por equipe: hash, cookies de sessao e bloqueio temporario.
//
// - A senha nunca e guardada: so o scrypt dela (salt por equipe) fica no banco.
// - A sessao e um cookie assinado (HMAC com SESSION_SECRET) que carrega time, versao da senha e
//   validade. Trocar a senha sobe a versao e todo cookie antigo deixa de valer.
// - Bloqueio temporario: muitas falhas do mesmo IP na mesma equipe travam por alguns minutos.

import {
  createHmac,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

import { supabaseAdmin } from "../supabase";

const scrypt = promisify(scryptCb);

/** Cookie da sessao de edicao, por equipe. */
export const SESSION_COOKIE_PREFIX = "premade_edit_";
/** Uma sessao vale um dia: editar e gerir dados, nao manter acesso para sempre. */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1_000;
/** Falhas seguidas antes do bloqueio. */
export const MAX_FAILURES = 5;
/** Tempo de bloqueio depois de estourar as falhas. */
export const BLOCK_MS = 10 * 60 * 1_000;
/** Senha curta nao protege nada. */
export const PASSWORD_MIN = 4;
export const PASSWORD_MAX = 128;

const SCRYPT_KEYLEN = 64;

/** Sem segredo proprio, as sessoes caem para a chave do Supabase (ja obrigatoria no app). */
function sessionSecret(): string {
  return (
    process.env.PREMADE_SESSION_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    ""
  );
}

export function cookieName(teamId: string): string {
  return `${SESSION_COOKIE_PREFIX}${teamId}`;
}

function hash(value: string): Buffer {
  const secret = sessionSecret();
  if (!secret) throw new Error("premade: session secret missing");
  return createHmac("sha256", secret).update(value).digest();
}

/** O cookie: id do time, versao da senha e expiracao, assinados. */
export function signSession(
  teamId: string,
  version: number,
  expiresAt: number,
): string {
  const payload = Buffer.from(
    JSON.stringify({ t: teamId, v: version, e: expiresAt }),
  ).toString("base64url");
  const mac = hash(payload).toString("base64url");
  return `${payload}.${mac}`;
}

/** Le o cookie sem confiar em nada: assinatura, time e validade sao conferidas aqui. */
export function readSession(
  token: string | undefined,
  teamId: string,
  version: number,
): boolean {
  if (!token) return false;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return false;
  const expected = hash(payload);
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return false;
  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as {
      t?: unknown;
      v?: unknown;
      e?: unknown;
    };
    return (
      data.t === teamId &&
      data.v === version &&
      typeof data.e === "number" &&
      data.e > Date.now()
    );
  } catch {
    return false;
  }
}

export function newSalt(): string {
  return randomBytes(16).toString("hex");
}

export async function hashPassword(
  password: string,
  salt: string,
): Promise<string> {
  const derived = (await scrypt(password, salt, SCRYPT_KEYLEN)) as Buffer;
  return derived.toString("hex");
}

/** Compara em tempo constante: o hash guardado nunca vaza, nem pelo tempo de resposta. */
export async function verifyPassword(
  password: string,
  salt: string,
  expectedHex: string,
): Promise<boolean> {
  const derived = await hashPassword(password, salt);
  const actual = Buffer.from(derived, "hex");
  const expected = Buffer.from(expectedHex, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** Um id de IP vira hash: o contador de falhas nao guarda o endereco cru. */
export function ipHash(ip: string): string {
  return createHmac("sha256", sessionSecret() || "premade")
    .update(ip)
    .digest("hex")
    .slice(0, 32);
}

export interface TeamCredentials {
  id: string;
  passwordHash: string | null;
  salt: string | null;
  version: number;
}

export async function getCredentials(
  teamId: string,
): Promise<TeamCredentials | null> {
  const { data } = await supabaseAdmin
    .from("premade_teams")
    .select("id, edit_password_hash, edit_salt, password_version")
    .eq("id", teamId)
    .maybeSingle();
  if (!data) return null;
  const row = data as {
    id: string;
    edit_password_hash: string | null;
    edit_salt: string | null;
    password_version: number | null;
  };
  return {
    id: row.id,
    passwordHash: row.edit_password_hash,
    salt: row.edit_salt,
    version: row.password_version ?? 0,
  };
}

/** Grava a senha nova e sobe a versao, o que derruba todas as sessoes antigas. */
export async function savePassword(
  teamId: string,
  passwordHash: string,
  salt: string,
): Promise<number> {
  const current = await getCredentials(teamId);
  const version = (current?.version ?? 0) + 1;
  const { error } = await supabaseAdmin
    .from("premade_teams")
    .update({
      edit_password_hash: passwordHash,
      edit_salt: salt,
      password_version: version,
    })
    .eq("id", teamId);
  if (error) throw error;
  return version;
}

export interface AttemptState {
  blocked: boolean;
  retryAfterSeconds: number;
  failures: number;
}

export async function getAttempt(
  teamId: string,
  ip: string,
): Promise<AttemptState> {
  const { data } = await supabaseAdmin
    .from("premade_login_attempts")
    .select("failures, blocked_until")
    .eq("team_id", teamId)
    .eq("ip_hash", ipHash(ip))
    .maybeSingle();
  if (!data) return { blocked: false, retryAfterSeconds: 0, failures: 0 };
  const row = data as { failures: number; blocked_until: string | null };
  const until = row.blocked_until ? new Date(row.blocked_until).getTime() : 0;
  const remaining = until - Date.now();
  return {
    blocked: remaining > 0,
    retryAfterSeconds: remaining > 0 ? Math.ceil(remaining / 1_000) : 0,
    failures: row.failures,
  };
}

/** Conta uma falha e, ao passar do limite, bloqueia por um tempo. */
export async function registerFailure(
  teamId: string,
  ip: string,
): Promise<AttemptState> {
  const key = ipHash(ip);
  const { data } = await supabaseAdmin
    .from("premade_login_attempts")
    .select("failures")
    .eq("team_id", teamId)
    .eq("ip_hash", key)
    .maybeSingle();
  const failures = ((data as { failures: number } | null)?.failures ?? 0) + 1;
  const blocked_until =
    failures >= MAX_FAILURES
      ? new Date(Date.now() + BLOCK_MS).toISOString()
      : null;
  await supabaseAdmin
    .from("premade_login_attempts")
    .upsert(
      {
        team_id: teamId,
        ip_hash: key,
        failures,
        blocked_until,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id,ip_hash" },
    );
  return {
    blocked: blocked_until !== null,
    retryAfterSeconds: blocked_until ? Math.ceil(BLOCK_MS / 1_000) : 0,
    failures,
  };
}

/** Senha certa zera o contador: quem acertou nao continua perto do bloqueio. */
export async function clearFailures(teamId: string, ip: string): Promise<void> {
  await supabaseAdmin
    .from("premade_login_attempts")
    .delete()
    .eq("team_id", teamId)
    .eq("ip_hash", ipHash(ip));
}

/** IP de quem chamou, atras de proxy ou nao. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip")?.trim() || "local";
}
