import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type UpdateInvestmentSettingsBody = {
  investingEnabled?: boolean;
};

export async function PATCH(request: Request) {
  const body = (await request.json()) as UpdateInvestmentSettingsBody;

  if (typeof body.investingEnabled !== "boolean") {
    return NextResponse.json(
      { error: "Geen geldige instelling ontvangen." },
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
    investing_enabled: boolean;
  } = {
    user_id: user.id,
    investing_enabled: body.investingEnabled,
  };

  const { data, error } = await supabase
    .from("investment_settings")
    .upsert(payload, { onConflict: "user_id" })
    .select("user_id, investing_enabled")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    settings: {
      userId: data.user_id,
      investingEnabled: data.investing_enabled,
    },
  });
}
