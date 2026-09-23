import { Star } from "lucide-react";
import { motion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { tftUnitIconUrl } from "@/lib/cdn";
import { splitDuration } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { focusRing } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconFrame } from "@/components/ui/icon-frame";
import { Tip } from "@/components/ui/tooltip";
import { DURATION, EASE_OUT, SPRING } from "@/lib/motion";
import { placementVariant, tftDisplayName, tftQueueKey } from "./tft-names";
import type { TftMatch, TftParticipant, TftTrait, TftUnit } from "./types";

const TRAIT_STYLES = [
  { key: "inactive", className: "border-border/60 text-subtle-foreground" },
  { key: "bronze", className: "border-trait-bronze/40 bg-trait-bronze/10 text-trait-bronze" },
  { key: "silver", className: "border-trait-silver/40 bg-trait-silver/10 text-trait-silver" },
  { key: "gold", className: "border-trait-gold/40 bg-trait-gold/10 text-trait-gold" },
  { key: "prismatic", className: "border-trait-prismatic/40 bg-trait-prismatic/10 text-trait-prismatic" },
] as const;

const STAR_STYLES: Record<number, { ring: string; text: string }> = {
  1: { ring: "ring-1 ring-border-strong", text: "text-muted-foreground" },
  2: { ring: "ring-2 ring-place-top4", text: "text-place-top4" },
  3: { ring: "ring-2 ring-trait-gold", text: "text-trait-gold" },
};

const listVariants = (stagger: number) => ({ hidden: {}, visible: { transition: { staggerChildren: stagger } } });
const unitVariants = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: { opacity: 1, scale: 1, transition: SPRING.snappy },
};
const chipVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.base, ease: EASE_OUT } },
};

const num = (chunks: React.ReactNode) => <span className="num text-foreground">{chunks}</span>;

interface TftMatchRowProps {
  match: TftMatch;
  participant: TftParticipant;
  ddragonVersion: string | null;
  /** Reference time for relative dates (fixed per render to keep SSR and hydration in sync). */
  now: number;
}

export function TftMatchRow({ match, participant, ddragonVersion, now }: TftMatchRowProps) {
  const t = useTranslations("tft");
  const format = useFormatter();
  const { placement } = participant;
  const { minutes, seconds } = splitDuration(match.info.game_length);
  const playedAt = new Date(match.info.game_datetime);

  const traits = [...(participant.traits ?? [])].sort(
    (a, b) => b.style - a.style || b.num_units - a.num_units,
  );
  const augments = participant.augments ?? [];
  const units = participant.units ?? [];

  return (
    <Card
      padding="md"
      className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3 sm:gap-x-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={SPRING.snappy}
        className="self-start sm:row-span-2"
      >
        <Badge
          variant={placementVariant(placement)}
          className="num h-10 min-w-12 justify-center px-2 text-lg font-semibold sm:h-12 sm:min-w-14 sm:text-xl"
        >
          <span className="sr-only">{t("placementLabel")}: </span>
          {t("placement", { n: placement })}
        </Badge>
      </motion.div>

      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="text-sm font-medium text-foreground">
            {t(`queue.${tftQueueKey(match.info.queue_id, match.info.tft_game_type)}`)}
          </span>
          {match.info.tft_set_number != null && <span>{t("set", { set: match.info.tft_set_number })}</span>}
          <time dateTime={playedAt.toISOString()} title={format.dateTime(playedAt, { dateStyle: "medium", timeStyle: "short" })}>
            {format.relativeTime(playedAt, now)}
          </time>
          <span className="num">{t("duration", { minutes, seconds: String(seconds).padStart(2, "0") })}</span>
        </p>
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{t.rich("level", { level: participant.level, num })}</span>
          <span>{t.rich("goldLeft", { gold: participant.gold_left, num })}</span>
          {(participant.players_eliminated ?? 0) > 0 && (
            <span>{t.rich("eliminated", { count: participant.players_eliminated!, num })}</span>
          )}
          {participant.total_damage_to_players != null && (
            <span>{t.rich("damage", { damage: format.number(participant.total_damage_to_players), num })}</span>
          )}
        </p>
      </div>

      <div className="col-span-2 space-y-3 sm:col-span-1 sm:col-start-2">
        {traits.length > 0 && (
          <motion.ul
            aria-label={t("traits")}
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={listVariants(0.02)}
            className="flex flex-wrap gap-1.5"
          >
            {traits.map((trait) => (
              <TraitChip key={trait.name} trait={trait} />
            ))}
          </motion.ul>
        )}

        {augments.length > 0 && (
          <ul aria-label={t("augments")} className="flex flex-wrap gap-1.5">
            {augments.map((augment) => (
              <li key={augment}>
                <Tip label={tftDisplayName(augment)}>
                  <span tabIndex={0} className={cn("inline-flex rounded-sm", focusRing)}>
                    <Badge variant="neutral" size="md" className="font-normal">
                      {tftDisplayName(augment)}
                    </Badge>
                  </span>
                </Tip>
              </li>
            ))}
          </ul>
        )}

        {units.length > 0 && (
          <motion.ul
            aria-label={t("units")}
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={listVariants(0.02)}
            className="flex flex-wrap gap-x-2 gap-y-4 pb-2 pt-1"
          >
            {units.map((unit, i) => (
              <UnitIcon key={`${unit.character_id}-${i}`} unit={unit} ddragonVersion={ddragonVersion} />
            ))}
          </motion.ul>
        )}
      </div>
    </Card>
  );
}

function TraitChip({ trait }: { trait: TftTrait }) {
  const t = useTranslations("tft");
  const style = TRAIT_STYLES[Math.min(TRAIT_STYLES.length - 1, Math.max(0, trait.style))];
  const name = tftDisplayName(trait.name);
  const styleLabel = t(`traitStyle.${style.key}`);

  return (
    <motion.li variants={chipVariants}>
      <Tip
        label={t("traitTitle", {
          name,
          style: styleLabel,
          current: trait.tier_current,
          total: trait.tier_total,
          units: trait.num_units,
        })}
      >
        <span
          tabIndex={0}
          className={cn(
            focusRing,
            "inline-flex items-center gap-1 rounded-sm border px-1.5 py-1 text-2xs font-medium leading-none",
            style.className,
          )}
        >
          <span className="num">{trait.num_units}</span>
          <span>{name}</span>
          <span className="sr-only">({styleLabel})</span>
        </span>
      </Tip>
    </motion.li>
  );
}

function UnitIcon({ unit, ddragonVersion }: { unit: TftUnit; ddragonVersion: string | null }) {
  const t = useTranslations("tft");
  const name = unit.name || tftDisplayName(unit.character_id);
  const stars = Math.max(1, Math.min(3, unit.tier || 1));
  const itemCount = Math.max(unit.itemNames?.length ?? 0, unit.items?.length ?? 0);
  const starStyle = STAR_STYLES[stars];
  const details = t("unitTitle", {
    name,
    stars: t("stars", { count: stars }),
    items: t("items", { count: itemCount }),
  });

  return (
    <motion.li variants={unitVariants} className="group/unit relative">
      <Tip label={details}>
        <span tabIndex={0} className={cn("block rounded-md", focusRing)}>
      <IconFrame
        src={tftUnitIconUrl(ddragonVersion, unit.character_id)}
        alt=""
        size="md"
        shape="rounded"
        unoptimized
        className={starStyle.ring}
        imageClassName="transition-transform duration-fast group-hover/unit:scale-105"
        badge={
          <span
            aria-hidden
            className={cn(
              "flex items-center gap-px rounded-full border border-border bg-background px-1 py-0.5",
              starStyle.text,
            )}
          >
            {Array.from({ length: stars }, (_, i) => (
              <Star key={i} className="size-2.5 fill-current" />
            ))}
          </span>
        }
      />
      {itemCount > 0 && (
        <span
          aria-hidden
          className="num absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full border border-border bg-background text-2xs leading-none text-foreground"
        >
          {itemCount}
        </span>
      )}
          <span className="sr-only">{details}</span>
        </span>
      </Tip>
    </motion.li>
  );
}
