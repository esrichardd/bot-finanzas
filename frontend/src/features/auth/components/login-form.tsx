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

export function LoginForm() {
  const t = useTranslations("auth");
  const commonT = useTranslations("common");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
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

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="w-full space-y-4">
      <p className="text-center font-serif text-2xl leading-tight">
        {t("loginCta")}
      </p>
      <Card className="w-full max-w-sm rounded-lg border shadow-sm">
        <CardHeader>
          <CardTitle className="font-serif text-2xl font-normal">
            {t("loginTitle")}
          </CardTitle>
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
                className="h-10"
                id="login-email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">{t("password")}</Label>
              <div className="relative">
                <Input
                  className="h-10 pr-10"
                  id="login-password"
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
              {isSubmitting ? commonT("loading") : t("loginButton")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
