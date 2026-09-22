"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/layout/page-shell";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errors");
  const tCommon = useTranslations("common");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageShell className="flex flex-1 items-center justify-center">
      <Card className="w-full max-w-md">
        <EmptyState
          icon={AlertTriangle}
          title={t("loadFailed")}
          description={t("loadFailedHint")}
          action={
            <Button variant="primary" size="sm" onClick={reset}>
              {tCommon("retry")}
            </Button>
          }
        />
      </Card>
    </PageShell>
  );
}
