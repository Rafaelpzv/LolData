import Link from "next/link";
import { UserX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/layout/page-shell";

/** Rendered when the Riot ID doesn't exist in the requested region. */
export default async function PlayerNotFound() {
  const t = await getTranslations("errors");
  return (
    <PageShell className="flex flex-1 items-center justify-center">
      <Card className="w-full max-w-md">
        <EmptyState
          icon={UserX}
          title={t("playerNotFound")}
          description={t("playerNotFoundHint")}
          action={
            <Button asChild variant="primary" size="sm">
              <Link href="/">{t("backHome")}</Link>
            </Button>
          }
        />
      </Card>
    </PageShell>
  );
}
