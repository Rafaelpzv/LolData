// Checagem de acesso a edicao, para as rotas de API: sem sessao valida, nada de escrever.
import { NextResponse } from "next/server";

import { getTeamBySlug } from "./repository";
import { cookieName, getCredentials, readSession } from "./edit-session";

/**
 * O time da rota, ou a resposta que a rota deve devolver.
 * 401 quando a equipe ja tem senha e o cookie nao vale; 404 quando o slug nao existe.
 */
export async function requireEdit(
  slug: string,
  request: Request,
): Promise<{
  team: Awaited<ReturnType<typeof getTeamBySlug>>;
  denied: NextResponse | null;
}> {
  const team = await getTeamBySlug(slug).catch(() => null);
  if (!team) {
    return {
      team: null,
      denied: NextResponse.json({ error: "notFound" }, { status: 404 }),
    };
  }
  const credentials = await getCredentials(team.id);
  // Equipe sem senha: o dono ainda nao definiu uma, entao nao ha como barrar sem travar o uso.
  if (!credentials?.passwordHash) return { team, denied: null };

  const token = parseCookie(request.headers.get("cookie"), cookieName(team.id));
  if (!readSession(token, team.id, credentials.version)) {
    return {
      team,
      denied: NextResponse.json({ error: "locked" }, { status: 401 }),
    };
  }
  return { team, denied: null };
}

export function parseCookie(
  header: string | null,
  name: string,
): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name)
      return decodeURIComponent(part.slice(index + 1).trim());
  }
  return undefined;
}
