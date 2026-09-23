"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { championIconUrl } from "@/lib/cdn";
import { championName } from "@/lib/champions";
import { profileHref } from "@/lib/riot-id";
import { Badge } from "@/components/ui/badge";
import { focusRing } from "@/components/ui/button";
import { IconFrame } from "@/components/ui/icon-frame";
import { StaggerItem } from "@/components/motion/reveal";
import { TipIcon, iconHover } from "./tip-icon";
import { participantItems, type LolParticipant } from "./types";
import { itemIcon, type DdragonData } from "./use-ddragon";

interface ParticipantRowProps {
  participant: LolParticipant;
  region: string;
  ddragon: DdragonData;
  /** The profile owner: highlighted row. */
  isOwner?: boolean;
}

/** One player in the expanded match: champion, spells, Riot ID (link to their profile), KDA, items. */
export function ParticipantRow({ participant: p, region, ddragon, isOwner }: ParticipantRowProps) {
  const t = useTranslations("matches");
  const tCommon = useTranslations("common");
  const champion = championName(p.championId) ?? p.championName;
  const name = p.riotIdGameName || p.summonerName || "";
  const spells = [p.summoner1Id, p.summoner2Id].map((id) => ddragon.spells.get(String(id)));

  return (
    <StaggerItem as="li" className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5">
      <TipIcon label={champion}>
        <IconFrame src={championIconUrl(p.championId)} alt={champion} size="sm" shape="rounded" imageClassName={iconHover} />
      </TipIcon>
      <span className="flex flex-col gap-0.5">
        {spells.map((spell, i) => (
          <TipIcon key={i} label={spell?.name}>
            <IconFrame
              src={spell?.icon}
              alt={spell?.name ?? t("summonerSpell")}
              size="xs"
              shape="square"
              imageClassName={iconHover}
            />
          </TipIcon>
        ))}
      </span>

      <span className="flex min-w-24 flex-1 flex-col">
        {name && p.riotIdTagline ? (
          <Link
            href={profileHref("lol", region, name, p.riotIdTagline)}
            title={`${name}#${p.riotIdTagline}`}
            className={cn(
              "truncate rounded-sm text-sm text-foreground underline-offset-4 hover:underline",
              isOwner && "font-semibold",
              focusRing,
            )}
          >
            {name}
          </Link>
        ) : (
          <span className="truncate text-sm text-muted-foreground">{name || tCommon("unknownPlayer")}</span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="num text-xs text-muted-foreground">
            {p.kills} / <span className="text-loss">{p.deaths}</span> / {p.assists}
          </span>
          {isOwner && <Badge variant="outline">{t("you")}</Badge>}
        </span>
      </span>

      <ul aria-label={t("items")} className="ml-auto flex gap-0.5">
        {participantItems(p).map((id, i) => (
          <li key={i}>
            <TipIcon label={id ? ddragon.items.get(id) : undefined}>
              <IconFrame
                src={itemIcon(ddragon, id)}
                alt={id ? (ddragon.items.get(id) ?? t("item", { id })) : ""}
                size="xs"
                shape="square"
                imageClassName={iconHover}
              />
            </TipIcon>
          </li>
        ))}
      </ul>
    </StaggerItem>
  );
}
