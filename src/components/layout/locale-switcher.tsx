"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { LOCALES, type Locale } from "@/i18n/config";
import { setLocale } from "@/i18n/actions";
import { focusRing } from "@/components/ui/button";
import { ActivePill } from "@/components/motion/active-pill";

const SHORT: Record<Locale, string> = { en: "EN", "pt-BR": "PT" };
const NAME: Record<Locale, string> = { en: "English", "pt-BR": "Português (Brasil)" };

export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const change = (next: Locale) => {
    if (next === locale) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  };

  return (
    <div
      role="group"
      aria-label={t("language")}
      aria-busy={isPending || undefined}
      className={cn("inline-flex h-8 items-center rounded-md border border-border bg-surface-sunken p-0.5", className)}
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={l === locale}
          aria-label={NAME[l]}
          onClick={() => change(l)}
          className={cn(
            "relative isolate h-full rounded-sm px-2 text-2xs font-medium transition-colors duration-fast",
            l === locale ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            focusRing,
          )}
        >
          {l === locale && <ActivePill layoutId="locale-pill" />}
          {SHORT[l]}
        </button>
      ))}
    </div>
  );
}
