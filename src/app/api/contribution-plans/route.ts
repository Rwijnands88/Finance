import { NextResponse } from "next/server";
import type { ContributionPlan } from "@/lib/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type ContributionPlanBody = {
  id?: string;
  householdId?: string;
  accountId?: string;
  userId?: string;
  label?: string;
  monthlyAmount?: number;
  depositDay?: number;
};

export async function POST(request: Request) {
  const body = (await request.json()) as ContributionPlanBody;
  const validationError = validateContributionPlanBody(body, false);

  if (validationError) {
    return validationError;
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  const { data: member, error: memberError } = await supabase
    .from("household_members")
    .select("user_id")
    .eq("household_id", body.householdId!)
    .eq("user_id", body.userId!)
    .limit(1)
    .maybeSingle();

  if (memberError || !member) {
    return NextResponse.json(
      { error: memberError?.message ?? "Gebruiker hoort niet bij dit huishouden." },
      { status: 400 },
    );
  }

  const { data: plan, error } = await supabase
    .from("contribution_plans")
    .insert({
      household_id: body.householdId!,
      account_id: body.accountId!,
      user_id: body.userId!,
      label: body.label!.trim(),
      monthly_amount: Number(body.monthlyAmount),
      deposit_day: Number(body.depositDay),
    })
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

export async function PATCH(request: Request) {
  const body = (await request.json()) as ContributionPlanBody;

  if (!body.id || !body.householdId) {
    return NextResponse.json(
      { error: "Stortingsafspraak ontbreekt." },
      { status: 400 },
    );
  }

  const validationError = validateContributionPlanBody(body, true);

  if (validationError) {
    return validationError;
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
      label: body.label!.trim(),
      monthly_amount: Number(body.monthlyAmount),
      deposit_day: Number(body.depositDay),
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
    label?: string | null;
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
    label: row.label ?? "Reguliere storting",
    monthlyAmount: Number(row.monthly_amount),
    depositDay: row.deposit_day,
    isActive: row.is_active,
  };
}

function validateContributionPlanBody(
  body: ContributionPlanBody,
  isUpdate: boolean,
) {
  const monthlyAmount = Number(body.monthlyAmount);
  const depositDay = Number(body.depositDay);

  if (
    !body.householdId ||
    (!isUpdate && (!body.accountId || !body.userId)) ||
    typeof body.label !== "string" ||
    !body.label.trim()
  ) {
    return NextResponse.json(
      { error: "Vul naam, bedrag en stortingsdag in." },
      { status: 400 },
    );
  }

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

  return null;
}
