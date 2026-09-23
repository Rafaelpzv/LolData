"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/page-shell";

export default function ProfileError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errors");
  const tCommon = useTranslations("common");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageShell>
      <Alert
        variant="destructive"
        title={t("loadFailed")}
        action={
          <Button size="sm" onClick={reset}>
            {tCommon("retry")}
          </Button>
        }
      >
        {t("loadFailedHint")}
      </Alert>
    </PageShell>
  );
}
