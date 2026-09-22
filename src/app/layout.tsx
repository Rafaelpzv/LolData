import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { GeistMono } from "geist/font/mono"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getTranslations } from "next-intl/server"
import { Providers } from "@/components/providers"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import "./globals.css"

const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
})

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("home")
  return {
    title: { default: "LolData", template: "%s · LolData" },
    description: t("metaDescription"),
    icons: { icon: "/favicon.ico" },
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()

  return (
    <html lang={locale} className={`${fontSans.variable} ${GeistMono.variable}`}>
      <body className="flex min-h-screen flex-col">
        <NextIntlClientProvider>
          <Providers>
            <AppHeader />
            <main id="content" className="flex flex-1 flex-col">
              {children}
            </main>
            <AppFooter />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
