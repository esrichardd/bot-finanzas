"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { authClient } from "../../../lib/auth";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";

export function LoginForm() {
  const t = useTranslations("auth");
  const commonT = useTranslations("common");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await authClient.signIn.email({ email, password });
    if (result.error) {
      setError(
        result.error.status === 401
          ? t("errorInvalidCredentials")
          : t("errorGeneric"),
      );
      setIsSubmitting(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{t("loginTitle")}</CardTitle>
        <CardDescription>
          {t("noAccount")}{" "}
          <Link
            className="text-primary underline underline-offset-4"
            href="/register"
          >
            {t("registerTitle")}
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="login-email">{t("email")}</Label>
            <Input
              id="login-email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-password">{t("password")}</Label>
            <Input
              id="login-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? commonT("loading") : t("loginButton")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
