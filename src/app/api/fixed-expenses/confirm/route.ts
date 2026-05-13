import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { instanceId } = await request.json();

  if (typeof instanceId !== "string") {
    return NextResponse.json(
      { error: "Vaste last ontbreekt." },
      { status: 400 },
    );
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("confirm_fixed_expense_instance", {
    target_instance_id: instanceId,
    target_amount: null,
    target_note: null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ transactionId: data.id });
}
