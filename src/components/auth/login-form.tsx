"use client";

import { useState } from "react";
import { LockKeyhole, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function signIn() {
    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch("/auth/sign-in", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json();

      if (!response.ok) {
        setMessage(
          typeof result.error === "string"
            ? result.error
            : "Inloggen lukte niet. Controleer je gegevens.",
        );
        return;
      }

      window.location.href = "/";
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Inloggen lukte niet. Controleer de Supabase instellingen.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Inloggen</CardTitle>
        <CardDescription>Gebruik het account van Ralph of Dorine.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="block space-y-2">
          <span className="text-sm text-zinc-400">E-mail</span>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <Input
              className="pl-10"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-zinc-400">Wachtwoord</span>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <Input
              className="pl-10"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        </label>

        {message && (
          <p className="rounded-[12px] border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">
            {message}
          </p>
        )}

        <Button
          className="w-full"
          onClick={signIn}
          disabled={isLoading || !email || !password}
        >
          {isLoading ? "Bezig..." : "Inloggen"}
        </Button>
      </CardContent>
    </Card>
  );
}
