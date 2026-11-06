"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Settings, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PremadePlayer } from "@/lib/premade/types";

import { PasswordGate } from "./password-gate";
import { RosterEditor } from "./roster-editor";

/**
 * O elenco dentro de um drawer: as regras sao as do editor de sempre, so mudaram de lugar.
 * Sem a sessao de edicao, o lugar do editor e do pedido de senha.
 */
export function RosterDrawer({
  slug,
  players,
}: {
  slug: string;
  players: PremadePlayer[];
}) {
  const t = useTranslations("premade.roster");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mayEdit, setMayEdit] = useState(false);

  // Confere a sessao a cada abertura: o cookie pode vencer com a pagina aberta.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(
          `/api/premade/${encodeURIComponent(slug)}/password`,
          { cache: "no-store" },
        );
        const body = (await res.json().catch(() => null)) as {
          hasPassword: boolean;
          unlocked: boolean;
        } | null;
        if (alive)
          setMayEdit(Boolean(body && (!body.hasPassword || body.unlocked)));
      } catch {
        if (alive) setMayEdit(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, slug]);

  // The native dialog keeps itself out of the layout, so the page scroll must be frozen by hand.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="outline">
        <Settings aria-hidden />
        {t("manage")}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="roster-drawer-title"
          className="fixed inset-0 z-50 flex items-end justify-end bg-background/60 p-0 sm:items-stretch sm:p-4"
        >
          {/* The backdrop closes the drawer; it is a button so the keyboard can do the same. */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default"
          />
          <div className="relative flex h-[92dvh] w-full flex-col gap-4 border border-border/70 bg-surface p-4 sm:h-auto sm:max-w-md sm:rounded-lg">
            <div className="flex items-center justify-between gap-3">
              <h2
                id="roster-drawer-title"
                className="text-base font-semibold tracking-tight text-foreground"
              >
                {t("manageTitle")}
              </h2>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setOpen(false)}
                aria-label={t("close")}
              >
                <X aria-hidden />
                {t("close")}
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {mayEdit ? (
                <RosterEditor
                  slug={slug}
                  players={players}
                  onDone={() => router.refresh()}
                />
              ) : (
                <>
                  <PasswordGate slug={slug} />
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("editingLocked")}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
