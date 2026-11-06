"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Check, Copy, ExternalLink, Link2, Link2Off, RotateCw } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import {
  Floating,
  FloatingAnchor,
  FloatingContent,
  listOptionClass,
} from "@/components/ui/popover-surface";

interface ShareState {
  shareId: string | null;
  enabled: boolean;
}

/** O painel aparece mesmo sem estado: escondido, "ligar o link" nao teria onde ser clicado. */
type Phase = "loading" | "ready" | "failed";

/**
 * O link publico do lineup: copiar, abrir, regenerar (invalida o antigo) e ligar/desligar.
 * Ligar, regenerar e desligar exigem a sessao de edicao; a rota responde 401 sem ela.
 */
export function ShareLineup({ slug }: { slug: string }) {
  const t = useTranslations("premade.share");
  const tActions = useTranslations("premade.actions");
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [state, setState] = useState<ShareState | null>(null);
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  const endpoint = `/api/premade/${encodeURIComponent(slug)}/share`;

  // O estado chega por callback do fetch, nunca direto no corpo do efeito: e o mesmo desenho do
  // resto do app e mantem o lint de efeitos limpo.
  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then((res) => res.json().then((body: ShareState | null) => ({ res, body })))
      .then(({ res, body }) => {
        if (controller.signal.aborted) return;
        if (!res.ok || !body) {
          setPhase("failed");
          return;
        }
        setState(body);
        setPhase("ready");
      })
      .catch((failure: Error) => {
        if (failure.name === "AbortError") return;
        setPhase("failed");
      });
    return () => controller.abort();
  }, [endpoint]);

  const retry = useCallback(() => {
    setPhase("loading");
    setError(false);
    fetch(endpoint, { cache: "no-store" })
      .then((res) => res.json().then((body: ShareState | null) => ({ res, body })))
      .then(({ res, body }) => {
        if (!res.ok || !body) {
          setPhase("failed");
          return;
        }
        setState(body);
        setPhase("ready");
      })
      .catch(() => setPhase("failed"));
  }, [endpoint]);

  const path = state?.shareId ? `/premade/lineup/${state.shareId}` : "";

  const patch = async (body: Record<string, unknown>) => {
    setMenu(false);
    setError(false);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const next = (await res.json().catch(() => null)) as ShareState | null;
      if (!res.ok || !next) {
        setError(true);
        return;
      }
      setState(next);
      setPhase("ready");
      router.refresh();
    } catch {
      setError(true);
    }
  };

  const copy = async () => {
    if (!path) return;
    try {
      await navigator.clipboard.writeText(
        new URL(path, window.location.origin).toString(),
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError(true);
    }
  };

  const enabled = phase === "ready" && state?.enabled === true;

  return (
    <Card padding="lg" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <CardTitle as="h3">{t("title")}</CardTitle>
          <CardDescription>
            {phase === "loading"
              ? t("loading")
              : phase === "failed"
                ? t("failedHint")
                : enabled
                  ? t("hint")
                  : t("disabledHint")}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {phase === "ready" && (
            <Floating open={menu} onOpenChange={setMenu}>
              {/* The menu opens on a plain click: the disclosure is a real button inside the anchor
                  Radix positions the panel against. Without the anchor the panel lands on the
                  viewport's top-left corner, off the card. */}
              <FloatingAnchor asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label={t("more")}
                  title={t("more")}
                  aria-expanded={menu}
                  aria-haspopup="menu"
                  onClick={() => setMenu((open) => !open)}
                >
                  <RotateCw aria-hidden />
                </Button>
              </FloatingAnchor>
              <FloatingContent
                align="end"
                className="w-56"
                role="menu"
                aria-label={t("more")}
              >
                <button
                  type="button"
                  role="menuitem"
                  className={listOptionClass(false)}
                  onClick={() => void patch({ regenerate: true })}
                >
                  <RotateCw aria-hidden className="size-4" />
                  {t("regenerate")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={listOptionClass(false)}
                  onClick={() => void patch({ enabled: !enabled })}
                >
                  {enabled ? (
                    <Link2Off aria-hidden className="size-4" />
                  ) : (
                    <Link2 aria-hidden className="size-4" />
                  )}
                  {enabled ? t("disable") : t("enable")}
                </button>
              </FloatingContent>
            </Floating>
          )}

          {phase === "failed" && (
            <Button type="button" size="sm" variant="outline" onClick={retry}>
              <RotateCw aria-hidden />
              {t("retry")}
            </Button>
          )}

          {/* Desligado: o mesmo id volta ao ar. Sem id: o primeiro link e gerado (e nasce desligado
              pelo banco, por isso o passo seguinte e religar). */}
          {phase === "ready" && !enabled && (
            <Button
              type="button"
              size="sm"
              onClick={() => void patch(state?.shareId ? { enabled: true } : { regenerate: true })}
            >
              <Link2 aria-hidden />
              {t("enable")}
            </Button>
          )}

          {phase === "ready" && enabled && (
            <Button type="button" size="sm" onClick={copy}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? t("copied") : t("copy")}
            </Button>
          )}
        </div>
      </div>

      {state?.shareId && (
        <p className="num truncate rounded-md border border-border/60 bg-surface-sunken px-2 py-1 text-xs text-muted-foreground">
          {path}
        </p>
      )}

      {state?.shareId && enabled && (
        <Button asChild size="sm" variant="ghost">
          <a href={path} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden />
            {t("open")}
          </a>
        </Button>
      )}

      {error && <Alert variant="warning">{tActions("collectError")}</Alert>}
    </Card>
  );
}
