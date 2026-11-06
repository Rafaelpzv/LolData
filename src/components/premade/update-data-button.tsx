"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  ChevronDown,
  Database,
  Layers,
  RefreshCw,
  Settings2,
  Square,
} from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Floating,
  FloatingAnchor,
  FloatingContent,
  listOptionClass,
} from "@/components/ui/popover-surface";
import { Spinner } from "@/components/ui/spinner";
import {
  progressOf,
  type LoopBody,
  type LoopOptions,
  type ProgressState,
} from "@/lib/premade/loop-progress";
import { UNLOCK_EVENT } from "./password-gate";

interface CollectStep {
  saved: number;
  collected: number;
  candidates: number;
  scansDone?: number;
  scansTotal?: number;
  /** List requests made in this batch: the loop reads it to see the batch moving. */
  reads?: number;
  /** The batch could not move the cursor: calling again would repeat it forever. */
  error?: string;
  done: boolean;
}

interface TimelineStep {
  withTimeline: number;
  total: number;
  calls: number;
  done: boolean;
}

interface AdvancedStep {
  total?: number;
  remaining?: number;
  withTimeline?: number;
}

interface RankStep {
  remaining: number;
  failed: number;
  done: boolean;
  /** Accounts whose row was written in this step (0 when Riot or Supabase did not answer). */
  saved?: number;
  /** The account this step worked on: the loop adds it to `skip`. */
  puuid?: string;
}

/** Batches the loop may run before handing the turn back to the user. */
const MAX_STEPS = 200;

/** How a data run ends: `stuck` means it would be repeating the same batch forever. */
type LoopOutcome = "done" | "stopped" | "failed" | "stuck";

type Phase = "matches" | "timelines" | "ranks";

/**
 * The one data action: collects matches, then timelines, then rebuilds the derived data, then
 * refreshes the account rank cache (Summoner-V4 + League-V4). One indicator, one cancel button.
 * The advanced menu next to it repeats those steps one at a time ("Refresh ranks and icons",
 * "Re-read stored games", "Collect timelines"), for when only one of them is needed.
 */
export function UpdateDataButton({
  slug,
  minPeople,
  updatedAt,
  onRanksSynced,
  manage,
}: {
  slug: string;
  /** Minimum people per match the analysis currently uses; the collection counts by it. */
  minPeople: number;
  /** Last time the stored data changed (ISO), shown under the button. */
  updatedAt: string | null;
  /** Called when the score refresh finishes, so the page can re-render with the new icons. */
  onRanksSynced?: () => void;
  /** Rendered on the same row as the menu and the data action ("Manage", the roster drawer). */
  manage?: React.ReactNode;
}) {
  const t = useTranslations("premade.update");
  const tActions = useTranslations("premade.actions");
  const tRecollect = useTranslations("premade.recollect");
  const tTimeline = useTranslations("premade.timeline");
  const format = useFormatter();
  const router = useRouter();
  const [menus, setMenus] = useState(false);
  const [running, setRunning] = useState<Phase | null>(null);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [saved, setSaved] = useState(0);
  const [accounts, setAccounts] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [failed, setFailed] = useState(false);
  /** The run stopped because two batches in a row moved nothing: an error, not a silent stop. */
  const [stuck, setStuck] = useState(false);
  /** A write answered 401: the page is read-only until the team password is entered. */
  const [locked, setLocked] = useState(false);
  /** A single advanced action running from the menu. */
  const [advanced, setAdvanced] = useState<
    "recollect" | "timelines" | "ranks" | null
  >(null);
  /** The advanced action that ran last: the result line under the buttons reads it. */
  const [lastAction, setLastAction] = useState<"ranks" | null>(null);
  const cancelled = useRef(false);

  // Unlocking the page in another island clears the 401 state here: the next write may work.
  useEffect(() => {
    const onUnlock = () => {
      setLocked(false);
      setFailed(false);
    };
    window.addEventListener(UNLOCK_EVENT, onUnlock);
    return () => window.removeEventListener(UNLOCK_EVENT, onUnlock);
  }, []);

  // The "last update" label follows the clock without a refetch.
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const stop = () => {
    cancelled.current = true;
  };

  /** Calls one batch endpoint until it reports `done`; returns false when it never finished. */
  const loop = async <T,>(
    url: string,
    init: RequestInit,
    onStep: (body: T) => void,
    options: LoopOptions = {},
  ): Promise<LoopOutcome> => {
    // The client carries the run itself: the account just read is added to `skip`, so the loop walks
    // the roster once and stops even when an account cannot be written.
    let payload: Record<string, unknown> = JSON.parse(
      String(init.body ?? "{}"),
    ) as Record<string, unknown>;
    let state: ProgressState | null = null;
    for (let step = 0; step < MAX_STEPS; step++) {
      if (cancelled.current) return "stopped";
      const res = await fetch(url, { ...init, body: JSON.stringify(payload) });
      const body = (await res.json().catch(() => null)) as
        (T & LoopBody) | null;
      if (!res.ok || !body) {
        // 401: the edit session is gone (password set or rotated); the page must unlock again.
        if (res.status === 401) setLocked(true);
        return "failed";
      }
      onStep(body);
      // The batch says it cannot move the cursor: calling it again would repeat it forever.
      if (body.error) return "stuck";
      if (body.puuid)
        payload = {
          ...payload,
          skip: [...((payload.skip as string[] | undefined) ?? []), body.puuid],
        };
      if (body.done || body.calls === 0) return "done";
      const next = progressOf(body, state, options);
      // Two batches in a row that neither moved the cursor nor saved anything: stop here instead
      // of asking Riot forever.
      if (next === "stalled") return "stuck";
      state = next;
      // `restart` opens a new session: the following calls must resume the cursor it stored.
      if (payload.restart !== undefined)
        payload = { ...payload, restart: false };
    }
    // Too many batches: the run is going nowhere, say so instead of hanging.
    return "stuck";
  };

  const update = async () => {
    cancelled.current = false;
    setFailed(false);
    setStopped(false);
    setStuck(false);
    setSaved(0);
    setAccounts(0);
    try {
      setRunning("matches");
      setProgress(null);
      const matches = await loop<CollectStep>(
        `/api/premade/${slug}/collect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // "fresh" asks only for the games newer than each account's epoch, so a click reads a
          // handful of games. `restart` starts the session on this first call only: the next ones
          // resume the cursor it stores.
          body: JSON.stringify({
            minRoster: minPeople,
            restart: true,
            mode: "fresh",
          }),
        },
        (body) => {
          setProgress({
            done: body.scansDone ?? 0,
            total: Math.max(body.scansTotal ?? 0, body.scansDone ?? 0),
          });
          if (body.saved > 0) setSaved((value) => value + body.saved);
        },
        // The identity of the team is stable; what moves is how far the session read (`reads`).
        {
          progressKeys: ["scansDone"],
          ignore: ["collected", "scansTotal", "budgetHit"],
        },
      );
      if (matches !== "done") return finish(matches);

      setRunning("timelines");
      setProgress(null);
      const timelines = await loop<TimelineStep>(
        `/api/premade/${slug}/timelines`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rebuild: true }),
        },
        (body) =>
          setProgress({
            done: body.withTimeline,
            total: Math.max(body.total, body.withTimeline),
          }),
        { progressKeys: ["calls"] },
      );
      if (timelines !== "done") return finish(timelines);

      setRunning("ranks");
      setProgress(null);
      const ranks = await loop<RankStep>(
        `/api/premade/${slug}/ranks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Forced: the cache of the whole roster (both queues) is rewritten, however fresh it is.
          body: JSON.stringify({ force: true }),
        },
        (body) => {
          if (body.saved) setAccounts((value) => value + 1);
          if (body.remaining > 0) {
            setProgress((value) => {
              const done = (value?.done ?? 0) + 1;
              return {
                done,
                total: value?.total ?? done + (body.remaining ?? 0),
              };
            });
          }
        },
        { progressKeys: ["remaining"] },
      );
      if (ranks !== "done") return finish(ranks);
      setProgress(null);
      onRanksSynced?.();
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setRunning(null);
      cancelled.current = false;
    }
  };

  /** Ends a run: records what ran (the result line reads it after `advanced` is cleared) and refreshes. */
  const finish = (
    outcome: Exclude<LoopOutcome, "done">,
    kind: "ranks" | "other" = "other",
  ) => {
    setLastAction(kind === "ranks" ? "ranks" : null);
    if (outcome === "stopped") setStopped(true);
    if (outcome === "failed") setFailed(true);
    // The run went nowhere: that is an error the user has to see, never a silent stop.
    if (outcome === "stuck") setStuck(true);
    router.refresh();
  };

  /** Menu actions: one collection type on its own, with the same single indicator. */
  const runAdvanced = async (kind: "recollect" | "timelines") => {
    setMenus(false);
    cancelled.current = false;
    setFailed(false);
    setStopped(false);
    setStuck(false);
    setAdvanced(kind);
    setProgress(null);
    try {
      const url =
        kind === "recollect"
          ? `/api/premade/${slug}/recollect`
          : `/api/premade/${slug}/timelines`;
      const outcome = await loop<AdvancedStep>(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // This step only re-reads the games already stored; the full-history walk of the lists is
          // the collection itself (it runs before this one in "Update data").
          body: JSON.stringify({}),
        },
        (body) => {
          if (kind === "recollect" && body.total !== undefined) {
            setProgress({
              done: body.total - (body.remaining ?? 0),
              total: body.total,
            });
          }
          if (kind === "timelines" && body.total !== undefined) {
            setProgress({
              done: body.withTimeline ?? 0,
              total: Math.max(body.total, body.withTimeline ?? 0),
            });
          }
        },
      );
      if (outcome !== "done") return finish(outcome);
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setAdvanced(null);
      cancelled.current = false;
    }
  };

  /** Menu action: rewrite the cached icons and the two ranked queues of every roster account. */
  const runRanks = async () => {
    setMenus(false);
    cancelled.current = false;
    setFailed(false);
    setStopped(false);
    setStuck(false);
    setAdvanced("ranks");
    setProgress(null);
    setAccounts(0);
    try {
      const outcome = await loop<RankStep>(
        `/api/premade/${slug}/ranks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: true }),
        },
        (body) => {
          // One account per step; the failed ones are counted in the result line.
          if (body.saved) setAccounts((value) => value + 1);
          setProgress((value) => {
            const done = (value?.done ?? 0) + 1;
            return {
              done,
              total: value?.total ?? done + (body.remaining ?? 0),
            };
          });
        },
      );
      if (outcome !== "done") return finish(outcome, "ranks");
      onRanksSynced?.();
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setAdvanced(null);
      cancelled.current = false;
    }
  };

  const busy = running !== null || advanced !== null;
  const label = running
    ? progress
      ? running === "matches"
        ? t("progress.matches", progress)
        : running === "timelines"
          ? t("progress.timelines", progress)
          : t("progress.ranks", progress)
      : running === "matches"
        ? t("runs.matches")
        : running === "timelines"
          ? t("runs.timelines")
          : t("runs.ranks")
    : advanced
      ? advanced === "recollect"
        ? tRecollect("running")
        : advanced === "timelines"
          ? tTimeline("collecting")
          : t("runs.ranks")
      : t("action");
  const lastUpdate = updatedAt
    ? t("lastUpdate", {
        time: format.dateTime(new Date(updatedAt), {
          dateStyle: "short",
          timeStyle: "short",
        }),
      })
    : t("never");

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex h-10 items-center gap-2">
        {busy && (
          <Button
            variant="ghost"
            onClick={stop}
            aria-label={tActions("cancel")}
          >
            <Square aria-hidden />
            {tActions("cancel")}
          </Button>
        )}
        <Floating open={menus} onOpenChange={(open) => !busy && setMenus(open)}>
          <FloatingAnchor>
            {/* The menu opens on a plain click: the disclosure is a real button, inside a positioned
                box Radix can anchor to. The hint is a native title, so no second trigger sits on top. */}
            <div className="relative">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                aria-label={t("advanced.label")}
                aria-expanded={menus}
                aria-haspopup="menu"
                title={t("advanced.hint")}
                onClick={() => setMenus((open) => !open)}
              >
                <Settings2 aria-hidden />
                <span className="hidden sm:inline">{t("advanced.label")}</span>
                <ChevronDown aria-hidden className="size-3.5" />
              </Button>
            </div>
          </FloatingAnchor>
          <FloatingContent
            align="end"
            className="w-72"
            role="menu"
            aria-label={t("advanced.label")}
          >
            {/* Each row: icon, action and one line saying what it does. */}
            <button
              type="button"
              role="menuitem"
              className={listOptionClass(false)}
              onClick={() => void runRanks()}
            >
              <RefreshCw
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground"
              />
              <span className="flex min-w-0 flex-col">
                <span>{t("refreshRanks")}</span>
                <span className="text-2xs text-muted-foreground">
                  {t("refreshRanksHint")}
                </span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              className={listOptionClass(false)}
              onClick={() => void runAdvanced("recollect")}
            >
              <Database
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground"
              />
              <span className="flex min-w-0 flex-col">
                <span>{tRecollect("action")}</span>
                <span className="text-2xs text-muted-foreground">
                  {tRecollect("hint")}
                </span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              className={listOptionClass(false)}
              onClick={() => void runAdvanced("timelines")}
            >
              <Layers
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground"
              />
              <span className="flex min-w-0 flex-col">
                <span>{tTimeline("collect")}</span>
                <span className="text-2xs text-muted-foreground">
                  {tTimeline("collectHint")}
                </span>
              </span>
            </button>
          </FloatingContent>
        </Floating>
        {/* "Manage" sits on this same row, between the menu and the data action. */}
        {manage}
        <Button onClick={update} disabled={busy} aria-busy={running !== null}>
          {busy ? <Spinner /> : <RefreshCw aria-hidden />}
          {label}
        </Button>
      </div>

      <p className="num text-2xs text-muted-foreground">{lastUpdate}</p>

      {!busy && !stopped && !failed && !stuck && saved > 0 && (
        <p role="status" className="num text-xs text-win">
          {t("savedMatches", { count: saved })}
        </p>
      )}
      {!busy &&
        !stopped &&
        !failed &&
        !stuck &&
        saved === 0 &&
        accounts > 0 && (
          <p role="status" className="num text-xs text-muted-foreground">
            {lastAction === "ranks"
              ? t("ranksDone", { count: accounts })
              : t("doneNoNew", { accounts })}
          </p>
        )}
      {stopped && (
        <p className="text-xs text-muted-foreground">
          {tActions("collectStopped")}
        </p>
      )}
      {/* Never a silent stop: a run that went nowhere says why. */}
      {stuck && (
        <Alert variant="warning">
          {lastAction === "ranks" ? t("ranksError") : t("stalled")}
        </Alert>
      )}
      {failed && (
        <Alert variant="warning">
          {locked
            ? t("locked")
            : lastAction === "ranks"
              ? t("ranksError")
              : tActions("collectError")}
        </Alert>
      )}
    </div>
  );
}
