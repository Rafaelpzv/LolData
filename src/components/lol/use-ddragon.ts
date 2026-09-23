"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { ddragonDataUrl, getDdragonVersion, itemIconUrl, runeIconUrl, spellIconUrl } from "@/lib/cdn";

interface NamedIcon {
  name: string;
  icon: string | null;
}

export interface DdragonData {
  version: string | null;
  spells: Map<string, NamedIcon>;
  runes: Map<number, NamedIcon>;
  items: Map<number, string>;
}

interface RawRune {
  id: number;
  name: string;
  icon: string;
  slots?: { runes?: RawRune[] }[];
}

const EMPTY: DdragonData = { version: null, spells: new Map(), runes: new Map(), items: new Map() };

/** Data Dragon locale for the UI locale (localized spell/rune/item names). */
function ddragonLocale(locale: string): string {
  return locale === "pt-BR" ? "pt_BR" : "en_US";
}

const cache = new Map<string, Promise<DdragonData>>();

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

function load(locale: string): Promise<DdragonData> {
  const cached = cache.get(locale);
  if (cached) return cached;

  const promise = (async (): Promise<DdragonData> => {
    const version = await getDdragonVersion();
    if (!version) return EMPTY;

    const [runesJson, spellsJson, itemsJson] = await Promise.all([
      fetchJson<RawRune[]>(ddragonDataUrl(version, "runesReforged.json", locale)),
      fetchJson<{ data: Record<string, { key: string; name: string; image: { full: string } }> }>(
        ddragonDataUrl(version, "summoner.json", locale),
      ),
      fetchJson<{ data: Record<string, { name: string }> }>(ddragonDataUrl(version, "item.json", locale)),
    ]);

    const runes = new Map<number, NamedIcon>();
    for (const style of runesJson ?? []) {
      runes.set(style.id, { name: style.name, icon: runeIconUrl(style.icon) });
      for (const slot of style.slots ?? []) {
        for (const rune of slot.runes ?? []) runes.set(rune.id, { name: rune.name, icon: runeIconUrl(rune.icon) });
      }
    }

    const spells = new Map<string, NamedIcon>();
    for (const spell of Object.values(spellsJson?.data ?? {})) {
      spells.set(String(spell.key), { name: spell.name, icon: spellIconUrl(version, spell.image.full) });
    }

    const items = new Map<number, string>();
    for (const [id, item] of Object.entries(itemsJson?.data ?? {})) items.set(Number(id), item.name);

    return { version, spells, runes, items };
  })();

  // Don't keep a failed load around: the next mount retries.
  promise.then((data) => data === EMPTY && cache.delete(locale));
  cache.set(locale, promise);
  return promise;
}

/** Spells, runes and item names from Data Dragon, fetched once per locale and shared by every match card. */
export function useDdragon(): DdragonData {
  const locale = ddragonLocale(useLocale());
  const [data, setData] = useState<DdragonData>(EMPTY);

  useEffect(() => {
    let active = true;
    load(locale).then((d) => active && setData(d));
    return () => {
      active = false;
    };
  }, [locale]);

  return data;
}

export function itemIcon(data: DdragonData, itemId: number): string | null {
  return itemIconUrl(data.version, itemId);
}
