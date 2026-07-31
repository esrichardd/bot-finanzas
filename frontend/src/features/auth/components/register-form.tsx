"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

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
import { authClient } from "../../../lib/auth";

export function RegisterForm() {
  const t = useTranslations("auth");
  const commonT = useTranslations("common");
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(t("errorPasswordTooShort"));
      return;
    }

    setIsSubmitting(true);

    const result = await authClient.signUp.email({ email, password, name });
    if (result.error) {
      setError(t("errorGeneric"));
      setIsSubmitting(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="w-full space-y-4">
      <p className="text-center font-serif text-2xl leading-tight">
        {t("registerCta")}
      </p>
      <Card className="w-full max-w-sm rounded-lg border shadow-sm">
        <CardHeader>
          <CardTitle className="font-serif text-2xl font-normal">
            {t("registerTitle")}
          </CardTitle>
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
                className="h-10"
                id="register-name"
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="register-email">{t("email")}</Label>
              <Input
                className="h-10"
                id="register-email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="register-password">{t("password")}</Label>
              <div className="relative">
                <Input
                  aria-describedby="register-password-hint"
                  aria-invalid={password.length > 0 && password.length < 8}
                  className="h-10 pr-10"
                  id="register-password"
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type={isPasswordVisible ? "text" : "password"}
                  value={password}
                />
                <Button
                  aria-label={
                    isPasswordVisible
                      ? t("hidePassword")
                      : t("showPassword")
                  }
                  className="absolute top-1/2 right-1 -translate-y-1/2"
                  onClick={() => setIsPasswordVisible((visible) => !visible)}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  {isPasswordVisible ? <EyeOff /> : <Eye />}
                </Button>
              </div>
              <p
                className={
                  password.length > 0 && password.length < 8
                    ? "text-xs text-destructive"
                    : "text-xs text-muted-foreground"
                }
                id="register-password-hint"
              >
                {t("passwordHint")}
              </p>
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button
              className="w-full"
              disabled={isSubmitting}
              size="lg"
              type="submit"
            >
              {isSubmitting ? commonT("loading") : t("registerButton")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
