import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function AuthShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const t = await getTranslations("common");

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      <Link className="font-serif text-2xl" href="/">
        {t("appName")}
      </Link>
      {children}
    </div>
  );
}
