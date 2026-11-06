"use client";

import { useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Layers, Square } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface TimelineStep {
  saved: number;
  withTimeline: number;
  total: number;
  remaining: number;
  failures: Record<string, number>;
  calls: number;
  done: boolean;
}

/** Batches the loop may run before handing the turn back to the user. */
const MAX_STEPS = 200;

/**
 * Collects the missing timelines batch by batch, exactly like the match button: each call answers
 * with where it stopped and this loop calls it again until `done` or the user cancels. The button
 * itself carries the "X de Y" progress, so no second spinner is shown.
 */
export function TimelineCollectButton({ slug }: { slug: string }) {
  const t = useTranslations("premade.timeline");
  const tActions = useTranslations("premade.actions");
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [coverage, setCoverage] = useState<{
    withTimeline: number;
    total: number;
  } | null>(null);
  const [failures, setFailures] = useState<Record<string, number>>({});
  const [stopped, setStopped] = useState(false);
  const [failed, setFailed] = useState(false);
  const cancelled = useRef(false);

  const collect = async () => {
    cancelled.current = false;
    setRunning(true);
    setFailed(false);
    setStopped(false);
    setFailures({});
    try {
      let finished = false;
      for (let step = 0; step < MAX_STEPS; step++) {
        if (cancelled.current) break;
        const res = await fetch(`/api/premade/${slug}/timelines`, {
          method: "POST",
        });
        const body = (await res
          .json()
          .catch(() => null)) as TimelineStep | null;
        if (!res.ok || !body) {
          setFailed(true);
          break;
        }
        setProgress({
          done: body.withTimeline,
          total: Math.max(body.total, body.withTimeline),
        });
        setCoverage({ withTimeline: body.withTimeline, total: body.total });
        setFailures((current) => {
          const next = { ...current };
          for (const [reason, count] of Object.entries(body.failures ?? {}))
            next[reason] = (next[reason] ?? 0) + count;
          return next;
        });
        if (body.done) {
          finished = true;
          break;
        }
        // A batch that made no call would loop forever: nothing left to ask for.
        if (body.calls === 0) {
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
        <Button
          size="sm"
          onClick={collect}
          disabled={running}
          aria-busy={running}
        >
          {running ? <Spinner /> : <Layers aria-hidden />}
          {running
            ? progress
              ? t("progress", { done: progress.done, total: progress.total })
              : t("collecting")
            : t("collect")}
        </Button>
      </div>

      {coverage && !running && (
        <p role="status" className="num text-xs text-muted-foreground">
          {t("done", {
            withTimeline: coverage.withTimeline,
            total: coverage.total,
          })}
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
