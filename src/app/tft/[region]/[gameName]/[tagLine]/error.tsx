"use client";

import { startTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/page-shell";

export default function TftProfileError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errors");
  const tCommon = useTranslations("common");
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageShell>
      <Alert
        variant="destructive"
        title={t("loadFailed")}
        action={
          <Button
            size="sm"
            onClick={() =>
              // Server-rendered data: refetch before resetting the boundary.
              startTransition(() => {
                router.refresh();
                reset();
              })
            }
          >
            {tCommon("retry")}
          </Button>
        }
      >
        {t("loadFailedHint")}
      </Alert>
    </PageShell>
  );
}
