import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type UpdateUserSettingsBody = {
  reconciliationEnabled?: boolean;
};

export async function PATCH(request: Request) {
  const body = (await request.json()) as UpdateUserSettingsBody;

  if (typeof body.reconciliationEnabled !== "boolean") {
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

  const { data, error } = await supabase
    .from("user_settings")
    .upsert(
      {
        user_id: user.id,
        reconciliation_enabled: body.reconciliationEnabled,
      },
      { onConflict: "user_id" },
    )
    .select("user_id, reconciliation_enabled")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    settings: {
      userId: data.user_id,
      reconciliationEnabled: data.reconciliation_enabled,
    },
  });
}
