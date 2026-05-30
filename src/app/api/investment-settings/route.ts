import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type UpdateInvestmentSettingsBody = {
  investingEnabled?: boolean;
  degiroTotal?: number;
};

export async function PATCH(request: Request) {
  const body = (await request.json()) as UpdateInvestmentSettingsBody;

  if (
    typeof body.investingEnabled !== "boolean" &&
    typeof body.degiroTotal !== "number"
  ) {
    return NextResponse.json(
      { error: "Geen geldige instelling ontvangen." },
      { status: 400 },
    );
  }

  if (
    typeof body.degiroTotal === "number" &&
    (!Number.isFinite(body.degiroTotal) || body.degiroTotal < 0)
  ) {
    return NextResponse.json(
      { error: "DeGiro-bedrag is ongeldig." },
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

  const payload: {
    user_id: string;
    investing_enabled?: boolean;
    degiro_total?: number;
  } = {
    user_id: user.id,
  };

  if (typeof body.investingEnabled === "boolean") {
    payload.investing_enabled = body.investingEnabled;
  }

  if (typeof body.degiroTotal === "number") {
    payload.degiro_total = roundMoney(body.degiroTotal);
  }

  const { data, error } = await supabase
    .from("investment_settings")
    .upsert(payload, { onConflict: "user_id" })
    .select("user_id, degiro_total, investing_enabled")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    settings: {
      userId: data.user_id,
      degiroTotal: Number(data.degiro_total),
      investingEnabled: data.investing_enabled,
    },
  });
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
