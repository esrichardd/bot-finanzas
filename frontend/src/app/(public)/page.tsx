import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { LocaleToggle } from "../../components/shared/locale-toggle";
import { ThemeToggle } from "../../components/shared/theme-toggle";
import { Button } from "../../components/ui/button";
import { HeroGraphic } from "../../features/landing/components/hero-graphic";

export default async function LandingPage() {
  const [t, commonT] = await Promise.all([
    getTranslations("landing"),
    getTranslations("common"),
  ]);

  return (
    <>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6 md:py-7">
        <Link className="font-serif text-xl" href="/">
          {commonT("appName")}
        </Link>
        <nav className="flex items-center gap-1" aria-label={commonT("appName")}>
          <LocaleToggle />
          <ThemeToggle />
          <Button
            render={<Link href="/login" />}
            nativeButton={false}
            size="sm"
            variant="ghost"
          >
            {t("ctaLogin")}
          </Button>
        </nav>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-20 sm:px-6 md:py-32">
        <section className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
          <h1 className="max-w-2xl font-serif text-4xl font-normal leading-tight tracking-tight sm:text-5xl md:text-6xl">
            {t("title")}
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
            {t("subtitle")}
          </p>
          <HeroGraphic />
          <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button
              className="w-full sm:w-auto"
              render={<Link href="/register" />}
              nativeButton={false}
              size="lg"
            >
              {t("ctaRegister")}
            </Button>
            <Button
              className="w-full sm:w-auto"
              render={<Link href="/login" />}
              nativeButton={false}
              size="lg"
              variant="outline"
            >
              {t("ctaLogin")}
            </Button>
          </div>
        </section>
      </main>
    </>
  );
}
