import { getTranslations } from "next-intl/server";

export async function AppFooter() {
  const t = await getTranslations("footer");
  return (
    <footer className="mt-auto border-t border-border/60">
      <div className="container space-y-1 py-6 text-center text-xs text-subtle-foreground">
        <p className="mx-auto max-w-3xl text-pretty">{t("disclaimer")}</p>
        <p>
          © {new Date().getFullYear()} LolData · {t("dataSource")}
        </p>
      </div>
    </footer>
  );
}
