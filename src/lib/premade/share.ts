import { createHash, randomBytes } from "node:crypto";

// Link publico do lineup: um id opaco por equipe, separado do slug, que pode ser regenerado.
import { supabaseAdmin } from "@/lib/supabase";

export interface ShareState {
  shareId: string | null;
  enabled: boolean;
}

/** 24 bytes em hex: longo o bastante para nao ser adivinhado. */
export function newShareId(): string {
  return randomBytes(24).toString("hex");
}

/**
 * Id publico derivado do slug. As equipes criadas antes da coluna `share_id` (migration 0019) usavam
 * este mesmo valor; o default da coluna continua igual para nao trocar nenhum link em circulacao.
 */
export function defaultShareId(slug: string): string {
  return createHash("sha256").update(slug).digest("hex").slice(0, 32);
}

/**
 * O link esta ligado? So um `false` explicito desliga: coluna vazia (equipe de antes da 0019) ou
 * resposta sem a coluna contam como ligado, o que mantem 200 os links que ja estao em circulacao.
 * Nenhuma escrita passa por aqui, e desligar/religar grava um booleano de verdade.
 */
export function isShareEnabled(value: unknown): boolean {
  return value !== false;
}

export async function getShareState(teamId: string): Promise<ShareState> {
  const { data } = await supabaseAdmin
    .from("premade_teams")
    .select("slug, share_id, share_enabled")
    .eq("id", teamId)
    .maybeSingle();
  const row = data as {
    slug: string;
    share_id: string | null;
    share_enabled: boolean | null;
  } | null;
  return {
    shareId: row ? (row.share_id ?? defaultShareId(row.slug)) : null,
    enabled: isShareEnabled(row?.share_enabled),
  };
}

/** Liga/desliga o link sem trocar o id; desligado responde 404. */
export async function setShareEnabled(
  teamId: string,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("premade_teams")
    .update({ share_enabled: enabled })
    .eq("id", teamId);
  if (error) throw error;
}

/**
 * Gera outro id: o link antigo deixa de existir no mesmo instante. O link novo nasce desligado,
 * como qualquer link de equipe nova: publicar e uma decisao de quem edita, nunca um efeito de "gerar".
 */
export async function regenerateShareId(teamId: string): Promise<string> {
  const shareId = newShareId();
  const { error } = await supabaseAdmin
    .from("premade_teams")
    .update({ share_id: shareId, share_enabled: false })
    .eq("id", teamId);
  if (error) throw error;
  return shareId;
}

/**
 * Equipe dona de um link, ou null quando nao existe ou esta desligado. O id derivado do slug nao
 * esta gravado em lugar nenhum: a equipe e achada pelo proprio slug.
 */
export async function getTeamByShareId(
  shareId: string,
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("premade_teams")
    .select("id, slug, share_enabled")
    .eq("share_id", shareId)
    .maybeSingle();
  const row = data as {
    id: string;
    slug: string;
    share_enabled: boolean | null;
  } | null;
  if (row) return isShareEnabled(row.share_enabled) ? row.id : null;
  // Um id so contem hex: o slug aceito aqui e apenas o de um id derivado conhecido.
  if (!/^[0-9a-f]{32}$/.test(shareId)) return null;
  const { data: teams } = await supabaseAdmin
    .from("premade_teams")
    .select("id, slug, share_enabled");
  const derived = (
    (
      teams as { id: string; slug: string; share_enabled: boolean | null }[] | null
    ) ?? []
  ).find((team) => defaultShareId(team.slug) === shareId);
  return derived && isShareEnabled(derived.share_enabled) ? derived.id : null;
}
