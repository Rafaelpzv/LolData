"use client";

import { useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { RefreshCw, Square } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { DEFAULT_MIN_PEOPLE, type MinPeopleTiers } from "@/lib/premade/collect";

interface CollectStep {
  saved: number;
  discarded: Record<string, number>;
  skipped: number;
  collected: number;
  candidates: number;
  remaining: number;
  done: boolean;
  minRoster?: number;
  tiers?: MinPeopleTiers;
  perAccount?: { puuid: string; games: number }[];
  presence?: { people: number; games: number }[];
  scansDone?: number;
  scansTotal?: number;
}

/** How many batches the loop runs before handing the turn back to the user. */
const MAX_STEPS = 200;
const LEVELS = [5, 4, 3, 2] as const;

/**
 * Collects the history batch by batch: each call answers with where it stopped, and this loop
 * calls it again until the collection reports `done` or the user cancels. The button itself shows
 * "X de Y" while that happens, so no second spinner is needed.
 */
export function CollectButton({ slug }: { slug: string }) {
  const t = useTranslations("premade.actions");
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [emptyRun, setEmptyRun] = useState<number | null>(null);
  const [stopped, setStopped] = useState(false);
  const [failed, setFailed] = useState(false);
  const [minPeople, setMinPeople] = useState<number>(DEFAULT_MIN_PEOPLE);
  /** Matches already handled against the total of this run, for the button label. */
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [tiers, setTiers] = useState<MinPeopleTiers | null>(null);
  /** Accounts that listed no Flex game in the run: the reason a collection ends up empty. */
  const [quiet, setQuiet] = useState<string[]>([]);
  /** Best overlap found in the run, so an empty result can say what the roster never reached. */
  const [best, setBest] = useState<number | null>(null);
  /** Games written by this run, shown when it ends so the click always has an outcome. */
  const [savedTotal, setSavedTotal] = useState(0);
  const cancelled = useRef(false);

  const stop = () => {
    cancelled.current = true;
  };

  const collect = async () => {
    cancelled.current = false;
    setRunning(true);
    setFailed(false);
    setEmptyRun(null);
    setStopped(false);
    setTiers(null);
    setQuiet([]);
    setBest(null);
    setProgress(null);
    setSavedTotal(0);
    try {
      let finished = false;
      let saved = 0;
      for (let step = 0; step < MAX_STEPS; step++) {
        if (cancelled.current) break;
        const res = await fetch(`/api/premade/${slug}/collect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // `restart` on the first call of a click: every click scans the lists again.
          body: JSON.stringify(
            step === 0
              ? { minRoster: minPeople, restart: true }
              : { minRoster: minPeople },
          ),
        });
        const body = (await res.json().catch(() => null)) as CollectStep | null;
        if (!res.ok || !body) {
          setFailed(true);
          break;
        }
        // The button follows the list scan first, then the details of what it found.
        setProgress({
          done: body.scansDone ?? 0,
          total: Math.max(body.scansTotal ?? 0, body.scansDone ?? 0),
        });
        saved += body.saved;
        setSavedTotal(saved);
        if (body.tiers) setTiers(body.tiers);
        // Accounts without a single Flex game explain an empty run (wrong region, no queue 440).
        const silent = (body.perAccount ?? [])
          .filter((account) => account.games === 0)
          .map((account) => account.puuid);
        if (silent.length > 0) setQuiet(silent);
        const top = Math.max(
          0,
          ...(body.presence ?? []).map((bucket) => bucket.people),
        );
        if (top > 0) setBest((current) => Math.max(current ?? 0, top));
        if (body.candidates === 0) setEmptyRun(body.collected);
        if (body.done) {
          finished = true;
          break;
        }
      }
      if (!finished) setStopped(true);
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setRunning(false);
      cancelled.current = false;
    }
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <label className="flex items-center gap-2 text-2xs text-muted-foreground">
        {t("minPeople")}
        <select
          value={minPeople}
          onChange={(event) => setMinPeople(Number(event.target.value))}
          disabled={running}
          className="h-7 rounded-md border border-border bg-surface px-1.5 text-xs text-foreground disabled:opacity-50"
        >
          {LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-2">
        {running && (
          <Button
            size="sm"
            variant="ghost"
            onClick={stop}
            aria-label={t("cancel")}
          >
            <Square aria-hidden />
            {t("cancel")}
          </Button>
        )}
        <Button
          size="sm"
          onClick={collect}
          disabled={running}
          aria-busy={running}
        >
          {running ? <Spinner /> : <RefreshCw aria-hidden />}
          {running
            ? progress
              ? t("collectProgress", {
                  done: Math.min(progress.done, progress.total),
                  total: progress.total,
                })
              : t("collecting")
            : t("collect")}
        </Button>
      </div>

      {!running && !stopped && !failed && savedTotal > 0 && (
        <p role="status" className="num text-xs text-win">
          {t("collectSaved", { count: savedTotal })}
        </p>
      )}
      {tiers && !running && (
        <p role="status" className="num text-xs text-muted-foreground">
          {t("tiers")}:{" "}
          {LEVELS.map((level) =>
            t("tier", { count: tiers[level] ?? 0, level }),
          ).join(" · ")}
        </p>
      )}
      {emptyRun !== null && !running && (
        <p role="status" className="num text-xs text-muted-foreground">
          {t("candidateProgress", { saved: emptyRun, total: emptyRun })}
        </p>
      )}
      {best !== null && best < minPeople && !running && (
        <Alert variant="warning">
          {t("neverTogether", { best, needed: minPeople })}
          {quiet.length > 0
            ? ` ${t("accountsWithoutGames", { count: quiet.length })}`
            : ""}
        </Alert>
      )}
      {stopped && !failed && (
        <p className="text-xs text-muted-foreground">{t("collectStopped")}</p>
      )}
      {failed && <Alert variant="warning">{t("collectError")}</Alert>}
    </div>
  );
}
