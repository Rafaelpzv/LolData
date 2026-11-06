import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import { Reveal } from "@/components/motion/reveal";
import { TeamForm } from "@/components/premade/team-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("premade");
  return { description: t("metaDescription") };
}

export default async function PremadePage() {
  const t = await getTranslations("premade.register");

  return (
    <PageShell>
      <Reveal immediate>
        <PageHeader title={t("title")} description={t("description")} />
      </Reveal>
      <Reveal immediate delay={0.05}>
        <TeamForm />
      </Reveal>
    </PageShell>
  );
}
