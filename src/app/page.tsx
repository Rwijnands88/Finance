import { FinanceDashboard } from "@/components/finance/finance-dashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardData } from "@/lib/supabase/dashboard";

export default async function Home() {
  let dashboardData;
  let loadError: unknown;

  try {
    dashboardData = await getDashboardData();
  } catch (error) {
    loadError = error;
  }

  if (dashboardData) {
    return <FinanceDashboard initialData={dashboardData} />;
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#09090B] px-4 text-zinc-50">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Huishouden niet gevonden</CardTitle>
          <CardDescription>
            De login werkt, maar deze gebruiker is nog niet gekoppeld aan een
            huishouden in Supabase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-zinc-400">
            Controleer of query 8 met de juiste Ralph- en Dorine-UUID&apos;s is
            uitgevoerd. Technische melding:{" "}
            {loadError instanceof Error ? loadError.message : "onbekend"}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
