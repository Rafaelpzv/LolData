"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert } from "./alert";
import { Button } from "./button";

/**
 * Error state for one async part of a page. Async server sections catch their own failures and
 * render this instead of throwing, so a Riot 429 in one section never touches the others.
 * "Try again" re-renders the page on the server (sections that loaded come back from cache).
 */
export function SectionFailed({ title }: { title: string }) {
  const router = useRouter();
  const t = useTranslations("common");
  const tErrors = useTranslations("errors");
  const [pending, startTransition] = React.useTransition();

  return (
    <Alert
      variant="destructive"
      title={title}
      action={
        <Button size="sm" variant="outline" loading={pending} onClick={() => startTransition(() => router.refresh())}>
          {t("retry")}
        </Button>
      }
    >
      {tErrors("loadFailedHint")}
    </Alert>
  );
}
