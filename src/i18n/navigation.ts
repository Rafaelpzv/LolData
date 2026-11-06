/**
 * next-intl navigation, without the locale prefix.
 *
 * The app keeps the locale in a cookie (no `/en` or `/pt-BR` segment in the URL), so the plain
 * Next router is what next-intl recommends for this setup: these wrappers exist so a future
 * locale-prefixed routing only has to change here.
 */
export { usePathname, useRouter } from "next/navigation";
