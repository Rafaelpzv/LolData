"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Settings, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PremadePlayer } from "@/lib/premade/types";
import { RosterEditor } from "./roster-editor";

/**
 * "Gerenciar": the roster editor in a drawer. The main page never shows accounts or remove
 * buttons; everything that changes the lineup lives here, with the same validations as before.
 * A plain dialog (no portal), so the page keeps its own stacking context.
 */
export function ManageRoster({
  slug,
  players,
}: {
  slug: string;
  players: PremadePlayer[];
}) {
  const t = useTranslations("premade.roster");
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        data-manage-trigger
        onClick={() => dialog.current?.showModal()}
      >
        <Settings aria-hidden />
        {t("manage")}
      </Button>

      <dialog
        ref={dialog}
        aria-labelledby="premade-manage-title"
        onClose={() => dialog.current?.blur()}
        onClick={(event) => {
          // A click on the backdrop (the dialog itself, outside its panel) closes it.
          if (event.target === event.currentTarget) close();
        }}
        className="m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-background/70 sm:m-auto sm:h-auto sm:max-h-[90dvh] sm:max-w-md"
      >
        <div className="flex h-full flex-col gap-4 overflow-y-auto border border-border bg-surface p-4 sm:rounded-lg sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2
                id="premade-manage-title"
                className="text-lg font-semibold text-foreground"
              >
                {t("manageTitle")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("addHint")}
              </p>
            </div>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={close}
              aria-label={t("close")}
            >
              <X aria-hidden />
            </Button>
          </div>
          <RosterEditor slug={slug} players={players} onDone={() => close()} />
        </div>
      </dialog>
    </>
  );
}
