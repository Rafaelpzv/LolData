"use client";

import { useId } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ALL_MODES_KEY, PREMADE_QUEUES } from "@/lib/premade/collect";

const fieldClass =
  "h-8 rounded-md border border-border bg-surface px-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * O filtro de modo da análise: todos os modos (o padrão), Flex 5x5 (440) ou Ranked 5s (710).
 *
 * O padrão junta as duas filas, que é o histórico inteiro do time. Escolher um modo recorta a
 * página: cada fila é coletada da própria lista, e a partida guarda a própria fila. Como o recorte
 * é feito no servidor, trocar refaz a análise — como o seletor de mínimo.
 *
 * `hrefs` é o caminho da escalação compartilhada, que não refaz nada no lugar: cada modo é uma
 * página própria (a URL carrega o modo), e trocar navega para ela.
 */
export function QueuePicker({
  value,
  onChange,
  hrefs,
}: {
  value: string;
  onChange?: (value: string) => void;
  /** Modo -> URL do modo. Sem `onChange`, é assim que a página compartilhada troca. */
  hrefs?: Record<string, string>;
}) {
  const t = useTranslations("premade.queues");
  const router = useRouter();
  const id = useId();

  const change = (next: string) => {
    if (onChange) {
      onChange(next);
      return;
    }
    const href = hrefs?.[next];
    if (href) router.push(href);
  };

  return (
    <label
      htmlFor={id}
      className="flex items-center gap-2 text-2xs text-muted-foreground"
    >
      {t("label")}
      <select
        id={id}
        value={value}
        onChange={(event) => change(event.target.value)}
        className={fieldClass}
      >
        <option value={ALL_MODES_KEY}>{t("all")}</option>
        {PREMADE_QUEUES.map((queue) => (
          <option key={queue.key} value={queue.key}>
            {t(queue.key)}
          </option>
        ))}
      </select>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t("hint")}
            className="rounded-full text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Info aria-hidden className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{t("hint")}</TooltipContent>
      </Tooltip>
    </label>
  );
}
