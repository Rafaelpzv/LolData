"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { CheckCircle2, UserPlus, Users } from "lucide-react";
import { DEFAULT_REGION } from "@/lib/regions";
import { PREMADE_MIN_SIZE, PREMADE_SIZE } from "@/lib/premade/members";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { RegionPicker } from "@/components/search/region-picker";

type ErrorKey =
  | "invalidBody"
  | "wrongRegion"
  | "duplicatePlayers"
  | "riotBusy"
  | "riotUnavailable"
  | "internal";

interface ErrorState {
  key: ErrorKey;
  players?: string;
}

const ERROR_KEYS: readonly ErrorKey[] = [
  "invalidBody",
  "wrongRegion",
  "duplicatePlayers",
  "riotBusy",
  "riotUnavailable",
  "internal",
];

const isErrorKey = (value: unknown): value is ErrorKey =>
  typeof value === "string" &&
  (ERROR_KEYS as readonly string[]).includes(value);

export function TeamForm() {
  const t = useTranslations("premade.register");
  const router = useRouter();
  const [slots, setSlots] = useState<string[]>(() =>
    Array(PREMADE_MIN_SIZE).fill(""),
  );
  const [name, setName] = useState("");
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<ErrorState | null>(null);

  const filled = slots.filter((slot) => slot.trim()).length;
  const complete = filled >= PREMADE_MIN_SIZE && name.trim().length > 0;

  /** The IDs the API could not resolve on this region, as typed, for the error message. */
  const slotNames = (indices: unknown): string | undefined => {
    if (!Array.isArray(indices) || indices.length === 0) return undefined;
    const names = indices
      .map((index) => slots[Number(index)]?.trim())
      .filter((value): value is string => Boolean(value));
    return names.length > 0 ? names.join(", ") : undefined;
  };

  const setSlot = (index: number, value: string) => {
    setSlots((prev) => prev.map((slot, i) => (i === index ? value : slot)));
    if (error) setError(null);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!complete || status === "loading") return;

    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/premade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          region,
          riotIds: slots.map((slot) => slot.trim()).filter(Boolean),
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        slug?: string;
        error?: unknown;
        slots?: unknown;
      } | null;

      if (!res.ok || !json?.slug) {
        const key = json && isErrorKey(json.error) ? json.error : "internal";
        const players =
          key === "wrongRegion" ? slotNames(json?.slots) : undefined;
        setError({ key, players });
        setStatus("idle");
        return;
      }

      setStatus("done");
      router.push(`/premade/${json.slug}`);
    } catch {
      setError({ key: "internal" });
      setStatus("idle");
    }
  };

  return (
    <Card padding="lg">
      <CardHeader>
        <div className="space-y-1">
          <CardTitle>{t("formTitle")}</CardTitle>
          <CardDescription>{t("formDescription")}</CardDescription>
        </div>
      </CardHeader>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="block text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("nameLabel")}
            </span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              maxLength={50}
              required
            />
          </label>

          <div className="space-y-1.5">
            <span className="block text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("regionLabel")}
            </span>
            {/* The picker is the one region control: keep the same vocabulary on every screen. */}
            <RegionPicker
              value={region}
              onChange={setRegion}
              appearance="field"
            />
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-2 flex items-center gap-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            <Users aria-hidden className="size-3.5" />
            {t("riotIdsLabel")}
          </legend>
          <p className="text-xs text-muted-foreground">{t("riotIdsHint")}</p>
          <ul className="space-y-2">
            {slots.map((value, index) => (
              <li key={index}>
                <Input
                  value={value}
                  onChange={(e) => setSlot(index, e.target.value)}
                  placeholder="Nome#TAG"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label={`${t("riotIdsLabel")} ${index + 1}`}
                  required={index < PREMADE_MIN_SIZE}
                />
              </li>
            ))}
          </ul>
          {slots.length < PREMADE_SIZE && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSlots((prev) => [...prev, ""])}
            >
              <UserPlus aria-hidden />
              {t("addSlot")}
            </Button>
          )}
        </fieldset>

        {error && (
          <Alert variant="destructive">
            {t(
              `errors.${error.key}`,
              error.players ? { players: error.players } : {},
            )}
          </Alert>
        )}

        <div className="flex items-center justify-end gap-3">
          {status === "done" && (
            <span
              role="status"
              className="flex items-center gap-1.5 text-xs text-win"
            >
              <CheckCircle2 aria-hidden className="size-4" />
              {t("created")}
            </span>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={!complete || status === "loading"}
          >
            {status === "loading" && <Spinner />}
            {status === "loading"
              ? t("submitting")
              : status === "done"
                ? t("created")
                : t("submit")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
