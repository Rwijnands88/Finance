import Link from "next/link";
import { redirect } from "next/navigation";
import { InvestmentSettingsToggle } from "@/components/finance/investment-settings-toggle";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: investmentSettings }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("investment_settings")
      .select("investing_enabled")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  return (
    <main className="min-h-dvh bg-[var(--bg-base)] px-4 py-6 text-[var(--text-primary)] sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-2xl gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-[var(--text-secondary)]">
              {profile?.display_name ?? "Mijn profiel"}
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Instellingen</h1>
          </div>
          <Link
            href="/"
            className="rounded-[10px] border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-white/[0.04] hover:text-[var(--text-primary)]"
          >
            Terug
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Mijn rekening</CardTitle>
            <CardDescription>
              Persoonlijke modules die alleen voor jouw account gelden.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InvestmentSettingsToggle
              initialEnabled={Boolean(investmentSettings?.investing_enabled)}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
