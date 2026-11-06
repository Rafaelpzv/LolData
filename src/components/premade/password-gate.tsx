"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { KeyRound, Lock, ShieldCheck } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Mode = "unlock" | "set" | "none";

/** Fired on window when the password was accepted: the other islands may retry their writes. */
export const UNLOCK_EVENT = "premade:unlocked";

interface PasswordState {
  hasPassword: boolean;
  unlocked: boolean;
}

/**
 * A senha de edicao da equipe. Equipe com senha e sessao vencida: pede a senha. Equipe sem senha:
 * avisa e deixa definir uma. O cookie e HttpOnly, entao quem sabe o estado e o GET desta rota; a
 * pagina recarrega quando a resposta muda.
 */
export function PasswordGate({ slug }: { slug: string }) {
  const t = useTranslations("premade.access");
  const tActions = useTranslations("premade.actions");
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<
    "wrongPassword" | "blocked" | "passwordLength" | "generic" | null
  >(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(
          `/api/premade/${encodeURIComponent(slug)}/password`,
          { cache: "no-store" },
        );
        const body = (await res
          .json()
          .catch(() => null)) as PasswordState | null;
        if (!alive) return;
        if (!body) {
          setMode("none");
          return;
        }
        setMode(!body.hasPassword ? "set" : body.unlocked ? "none" : "unlock");
      } catch {
        // A failed check must not hide the form: read-only is decided by the server.
        if (alive) setMode("unlock");
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || password.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/premade/${encodeURIComponent(slug)}/password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            mode === "set" ? { password, set: true } : { password },
          ),
        },
      );
      const body = (await res.json().catch(() => null)) as {
        error?: unknown;
      } | null;
      if (!res.ok) {
        const key = typeof body?.error === "string" ? body.error : "";
        setError(
          key === "wrongPassword" ||
            key === "blocked" ||
            key === "passwordLength"
            ? key
            : "generic",
        );
        return;
      }
      setPassword("");
      setMode("none");
      // Own event first (the header and the drawer listen to it), then the server data.
      window.dispatchEvent(new Event(UNLOCK_EVENT));
      router.refresh();
    } catch {
      setError("generic");
    } finally {
      setBusy(false);
    }
  };

  if (mode === null || mode === "none") return null;
  const isSet = mode === "set";

  return (
    <Card padding="lg" className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-muted-foreground">
          {isSet ? (
            <ShieldCheck aria-hidden className="size-4" />
          ) : (
            <Lock aria-hidden className="size-4" />
          )}
        </span>
        <div className="min-w-0 space-y-1">
          <CardTitle as="h3">
            {isSet ? t("setTitle") : t("lockedTitle")}
          </CardTitle>
          <CardDescription>
            {isSet ? t("setHint") : t("lockedHint")}
          </CardDescription>
        </div>
      </div>

      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="premade-password" className="sr-only">
            {t("password")}
          </label>
          <Input
            id="premade-password"
            type="password"
            autoComplete={isSet ? "new-password" : "current-password"}
            placeholder={t("password")}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            maxLength={128}
          />
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={busy || password.trim().length === 0}
        >
          <KeyRound aria-hidden />
          {isSet ? t("setAction") : t("unlock")}
        </Button>
      </form>

      {error === "wrongPassword" && (
        <Alert variant="warning">{t("wrong")}</Alert>
      )}
      {error === "blocked" && <Alert variant="warning">{t("blocked")}</Alert>}
      {error === "passwordLength" && (
        <Alert variant="warning">{t("length")}</Alert>
      )}
      {error === "generic" && (
        <Alert variant="warning">{tActions("collectError")}</Alert>
      )}
    </Card>
  );
}
