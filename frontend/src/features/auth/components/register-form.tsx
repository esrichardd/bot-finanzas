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

export function RegisterForm() {
  const t = useTranslations("auth");
  const commonT = useTranslations("common");
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await authClient.signUp.email({ email, password, name });
    if (result.error) {
      setError(t("errorGeneric"));
      setIsSubmitting(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{t("registerTitle")}</CardTitle>
        <CardDescription>
          {t("hasAccount")}{" "}
          <Link
            className="text-primary underline underline-offset-4"
            href="/login"
          >
            {t("loginTitle")}
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="register-name">{t("name")}</Label>
            <Input
              id="register-name"
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="register-email">{t("email")}</Label>
            <Input
              id="register-email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="register-password">{t("password")}</Label>
            <Input
              id="register-password"
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
            {isSubmitting ? commonT("loading") : t("registerButton")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
