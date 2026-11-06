"use client";

import { useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Database, Square } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface RecollectStep {
  saved: number;
  total: number;
  remaining: number;
  failures: Record<string, number>;
  calls: number;
  done: boolean;
}

/** Batches the loop may run before handing the turn back to the user. */
const MAX_STEPS = 200;

/**
 * Re-reads the games already stored so they gain the per-participant fields (items, spells, runes,
 * combat, vision, objectives): one Riot call per game still missing them. Same pattern as the other
 * collect buttons: the button itself shows "X de Y" and cancels the loop.
 */
export function RecollectButton({ slug }: { slug: string }) {
  const t = useTranslations("premade.recollect");
  const tActions = useTranslations("premade.actions");
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [result, setResult] = useState<{
    remaining: number;
    total: number;
  } | null>(null);
  const [failures, setFailures] = useState<Record<string, number>>({});
  const [stopped, setStopped] = useState(false);
  const [failed, setFailed] = useState(false);
  const cancelled = useRef(false);

  const run = async () => {
    cancelled.current = false;
    setRunning(true);
    setFailed(false);
    setStopped(false);
    setFailures({});
    setProgress(null);
    try {
      let finished = false;
      for (let step = 0; step < MAX_STEPS; step++) {
        if (cancelled.current) break;
        const res = await fetch(`/api/premade/${slug}/recollect`, {
          method: "POST",
        });
        const body = (await res
          .json()
          .catch(() => null)) as RecollectStep | null;
        if (!res.ok || !body) {
          setFailed(true);
          break;
        }
        setProgress({
          done: Math.max(0, body.total - body.remaining),
          total: body.total,
        });
        setResult({ remaining: body.remaining, total: body.total });
        setFailures((current) => {
          const next = { ...current };
          for (const [reason, count] of Object.entries(body.failures ?? {}))
            next[reason] = (next[reason] ?? 0) + count;
          return next;
        });
        if (body.done || body.calls === 0) {
          finished = true;
          break;
        }
      }
      // Timelines next (one call per game missing them), then the rebuild of the per-player derived
      // data from the stored timelines: the same button, the same progress, no second flow.
      if (finished && !cancelled.current) {
        for (let step = 0; step < MAX_STEPS; step++) {
          if (cancelled.current) break;
          const res = await fetch(`/api/premade/${slug}/timelines`, {
            method: "POST",
          });
          const body = (await res.json().catch(() => null)) as {
            done?: boolean;
            calls?: number;
          } | null;
          if (!res.ok || !body || body.done || body.calls === 0) break;
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

  const skipped = Object.entries(failures)
    .map(([reason, count]) => `${reason} ${count}`)
    .join(" · ");

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        {running && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => (cancelled.current = true)}
            aria-label={tActions("cancel")}
          >
            <Square aria-hidden />
            {tActions("cancel")}
          </Button>
        )}
        <Button size="sm" onClick={run} disabled={running} aria-busy={running}>
          {running ? <Spinner /> : <Database aria-hidden />}
          {running
            ? progress
              ? t("progress", progress)
              : t("running")
            : t("action")}
        </Button>
      </div>

      {result && !running && (
        <p role="status" className="num text-xs text-muted-foreground">
          {t("done", { remaining: result.remaining, total: result.total })}
        </p>
      )}
      {skipped && !running && (
        <p className="num text-xs text-muted-foreground">
          {t("failures", { list: skipped })}
        </p>
      )}
      {stopped && !failed && (
        <p className="text-xs text-muted-foreground">
          {tActions("collectStopped")}
        </p>
      )}
      {failed && <Alert variant="warning">{tActions("collectError")}</Alert>}
    </div>
  );
}
