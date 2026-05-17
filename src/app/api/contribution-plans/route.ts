import { NextResponse } from "next/server";
import type { ContributionPlan } from "@/lib/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type ContributionPlanBody = {
  id?: string;
  householdId?: string;
  monthlyAmount?: number;
  depositDay?: number;
};

export async function PATCH(request: Request) {
  const body = (await request.json()) as ContributionPlanBody;

  if (!body.id || !body.householdId) {
    return NextResponse.json(
      { error: "Stortingsafspraak ontbreekt." },
      { status: 400 },
    );
  }

  const monthlyAmount = Number(body.monthlyAmount);
  const depositDay = Number(body.depositDay);

  if (Number.isNaN(monthlyAmount) || monthlyAmount < 0) {
    return NextResponse.json(
      { error: "Maandbedrag moet nul of hoger zijn." },
      { status: 400 },
    );
  }

  if (!Number.isInteger(depositDay) || depositDay < 1 || depositDay > 31) {
    return NextResponse.json(
      { error: "Kies een dag tussen 1 en 31." },
      { status: 400 },
    );
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  const { data: plan, error } = await supabase
    .from("contribution_plans")
    .update({
      monthly_amount: monthlyAmount,
      deposit_day: depositDay,
    })
    .eq("id", body.id)
    .eq("household_id", body.householdId)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", plan.user_id)
    .maybeSingle();

  return NextResponse.json({
    plan: mapContributionPlan(plan, profile?.display_name ?? "Onbekend"),
  });
}

function mapContributionPlan(
  row: {
    id: string;
    account_id: string;
    user_id: string;
    monthly_amount: number;
    deposit_day: number;
    is_active: boolean;
  },
  person: string,
): ContributionPlan {
  return {
    id: row.id,
    accountId: row.account_id,
    userId: row.user_id,
    person,
    monthlyAmount: Number(row.monthly_amount),
    depositDay: row.deposit_day,
    isActive: row.is_active,
  };
}
