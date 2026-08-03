import { NextResponse } from "next/server";
import {
  currentIsoMonth,
  fetchOpenFixedExpenseMonths,
} from "@/lib/supabase/dashboard";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    return NextResponse.json(
      { error: membershipError?.message ?? "Huishouden ontbreekt." },
      { status: 400 },
    );
  }

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id, kind")
    .eq("household_id", membership.household_id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (accountsError) {
    return NextResponse.json({ error: accountsError.message }, { status: 400 });
  }

  const fallbackAccount =
    (accounts ?? []).find((account) => account.kind === "shared") ??
    (accounts ?? [])[0];
  try {
    const openFixedExpenseMonths = await fetchOpenFixedExpenseMonths(
      supabase,
      membership.household_id,
      `${currentIsoMonth()}-01`,
      fallbackAccount?.id,
    );

    return NextResponse.json({ openFixedExpenseMonths });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Openstaande vaste lasten konden niet worden opgehaald.",
      },
      { status: 400 },
    );
  }
}
