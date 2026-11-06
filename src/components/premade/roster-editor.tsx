"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Plus, Trash2, UserPlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PREMADE_MIN_SIZE } from "@/lib/premade/members";
import type { PremadePlayer } from "@/lib/premade/types";

/** Batches a single removal may spend on re-collecting the lineup, to bound the wait. */
const MAX_RECOLLECT_STEPS = 12;

type ErrorKey =
  "invalidRiotId" | "wrongRegion" | "duplicate" | "rosterTooSmall" | "generic";

const ERROR_KEYS: Record<string, ErrorKey> = {
  invalidRiotId: "invalidRiotId",
  invalidInput: "invalidRiotId",
  wrongRegion: "wrongRegion",
  duplicate: "duplicate",
  rosterTooSmall: "rosterTooSmall",
};

/**
 * Roster maintenance over people and their accounts. Removing an account or a person deletes it
 * from the database: the next collection and the analysis only see the lineup that is left.
 */
export function RosterEditor({
  slug,
  players,
  onDone,
}: {
  slug: string;
  players: PremadePlayer[];
  /** Called after a successful edit (the drawer closes itself). */
  onDone?: () => void;
}) {
  const t = useTranslations("premade.roster");
  const router = useRouter();
  const [riotId, setRiotId] = useState("");
  /** The person receiving a new account, null when the field adds a new person. */
  const [accountFor, setAccountFor] = useState<string | null>(null);
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  /** True while the games are being measured again after a removal. */
  const [recollecting, setRecollecting] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);

  const active = players.filter((player) => !player.archived);

  const fail = (status: number, body: unknown) => {
    const code = (body as { error?: string } | null)?.error;
    setError(
      (code && ERROR_KEYS[code]) || (status === 409 ? "duplicate" : "generic"),
    );
  };

  const send = async (url: string, init: RequestInit) => {
    const res = await fetch(url, init);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      fail(res.status, body);
      return false;
    }
    return true;
  };

  const addPlayer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!riotId.trim() || busy !== null) return;
    setBusy("add");
    setError(null);
    try {
      const ok = await send(`/api/premade/${slug}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riotId }),
      });
      if (!ok) return;
      setRiotId("");
      router.refresh();
      onDone?.();
    } catch {
      setError("generic");
    } finally {
      setBusy(null);
    }
  };

  const addAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accountFor || !accountId.trim() || busy !== null) return;
    setBusy(accountFor);
    setError(null);
    try {
      const ok = await send(`/api/premade/${slug}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riotId: accountId, playerId: accountFor }),
      });
      if (!ok) return;
      setAccountId("");
      setAccountFor(null);
      router.refresh();
      onDone?.();
    } catch {
      setError("generic");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (query: string, key: string) => {
    setBusy(key);
    setError(null);
    setRecollecting(false);
    try {
      const res = await fetch(`/api/premade/${slug}/members?${query}`, {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => null)) as {
        recollect?: { done: boolean } | null;
      } | null;
      if (!res.ok) {
        fail(res.status, body);
        return;
      }
      // The server already started the new collection; this finishes it so the numbers follow.
      if (body?.recollect && !body.recollect.done) await finishRecollect();
      router.refresh();
      onDone?.();
    } catch {
      setError("generic");
    } finally {
      setBusy(null);
      setRecollecting(false);
    }
  };

  /** Keeps collecting batch by batch until the lineup's games are measured again. */
  const finishRecollect = async () => {
    setRecollecting(true);
    for (let step = 0; step < MAX_RECOLLECT_STEPS; step++) {
      const res = await fetch(`/api/premade/${slug}/collect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await res.json().catch(() => null)) as {
        done?: boolean;
      } | null;
      if (!res.ok || !body || body.done) return;
    }
  };

  return (
    <div className="mt-3 space-y-3">
      <ul className="space-y-2">
        {players.map((player) => (
          <PlayerRow
            key={player.id}
            player={player}
            canRemove={active.length > PREMADE_MIN_SIZE}
            busy={busy}
            onRemoveAccount={(puuid) =>
              remove(`puuid=${encodeURIComponent(puuid)}`, puuid)
            }
            onRemovePlayer={() =>
              remove(`playerId=${encodeURIComponent(player.id)}`, player.id)
            }
            onAddAccount={() => {
              setAccountFor(accountFor === player.id ? null : player.id);
              setAccountId("");
              setError(null);
            }}
          />
        ))}
      </ul>

      {accountFor && (
        <form
          onSubmit={addAccount}
          className="flex flex-wrap items-center gap-2"
        >
          <Input
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            placeholder={t("accountPlaceholder")}
            aria-label={t("addAccount")}
            autoComplete="off"
            spellCheck={false}
            className="w-full sm:w-64"
          />
          <Button type="submit" size="sm" loading={busy === accountFor}>
            {t("addAccount")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setAccountFor(null)}
          >
            {t("remove")}
          </Button>
        </form>
      )}

      <form onSubmit={addPlayer} className="flex flex-wrap items-center gap-2">
        <Input
          value={riotId}
          onChange={(event) => setRiotId(event.target.value)}
          placeholder={t("addPlaceholder")}
          aria-label={t("add")}
          className="w-full sm:w-64"
        />
        {/* Always enabled: an initially disabled button would depend on client-only state.
            The handler ignores empty input and the busy flag instead. */}
        <Button type="submit" size="sm" loading={busy === "add"}>
          {busy === "add" ? <Spinner /> : <UserPlus aria-hidden />}
          {t("add")}
        </Button>
      </form>

      {recollecting && (
        <p role="status" className="text-xs text-muted-foreground">
          {t("recollecting")}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-loss">
          {t(`errors.${error}`)}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{t("addHint")}</p>
    </div>
  );
}

function PlayerRow({
  player,
  canRemove,
  busy,
  onRemoveAccount,
  onRemovePlayer,
  onAddAccount,
}: {
  player: PremadePlayer;
  canRemove: boolean;
  busy: string | null;
  onRemoveAccount: (puuid: string) => void;
  onRemovePlayer: () => void;
  onAddAccount: () => void;
}) {
  const t = useTranslations("premade.roster");
  const activeAccounts = player.accounts;
  const label =
    (activeAccounts[0] ?? player.accounts[0])?.gameName ?? player.gameName;

  return (
    <li className="rounded-md border border-border/60 px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="num text-xs text-muted-foreground">
          {player.accounts.length} {t("accounts")}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onAddAccount}
            aria-label={t("addAccountFor", { name: label })}
            title={t("addAccount")}
          >
            <Plus aria-hidden />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => {
              if (
                canRemove &&
                window.confirm(t("confirmRemovePlayer", { name: label }))
              )
                onRemovePlayer();
            }}
            disabled={busy !== null || !canRemove}
            aria-label={t("removeLabel", { name: label })}
            title={canRemove ? t("remove") : t("minRoster")}
          >
            {busy === player.id ? <Spinner /> : <Trash2 aria-hidden />}
          </Button>
        </div>
      </div>

      <ul className="mt-1.5 flex flex-wrap gap-2">
        {player.accounts.map((account) => (
          <li
            key={account.puuid}
            className="flex items-center gap-1 rounded-md bg-surface-sunken px-2 py-0.5"
          >
            <span className="flex items-baseline gap-1">
              <span className="text-xs text-foreground">
                {account.gameName}
              </span>
              <span className="num text-2xs text-muted-foreground">
                #{account.tagLine}
              </span>
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => {
                if (
                  window.confirm(
                    t("confirmRemoveAccount", {
                      name: `${account.gameName}#${account.tagLine}`,
                    }),
                  )
                ) {
                  onRemoveAccount(account.puuid);
                }
              }}
              disabled={busy !== null}
              aria-label={t("removeAccountLabel", {
                name: `${account.gameName}#${account.tagLine}`,
              })}
              title={
                player.accounts.length > 1
                  ? t("removeAccount")
                  : t("removeAccountLast")
              }
            >
              {busy === account.puuid ? <Spinner /> : <X aria-hidden />}
            </Button>
          </li>
        ))}
      </ul>
    </li>
  );
}
