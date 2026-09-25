"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Shown when some profile sections failed to load; retries by refreshing the server render. */
export function PartialDataAlert() {
  const t = useTranslations("matches.partialError");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Alert
      variant="warning"
      title={t("title")}
      action={
        <Button size="sm" loading={pending} onClick={() => startTransition(() => router.refresh())}>
          {tCommon("retry")}
        </Button>
      }
    >
      {t("description")}
    </Alert>
  );
}
