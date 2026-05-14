import { NextResponse } from "next/server";
import type { FixedExpenseInstance } from "@/lib/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type FixedExpenseActionBody = {
  instanceId?: string;
  action?: "confirm" | "skip";
  amount?: number | null;
  note?: string | null;
};

export async function POST(request: Request) {
  const body = (await request.json()) as FixedExpenseActionBody;
  const action = body.action ?? "confirm";

  if (typeof body.instanceId !== "string") {
    return NextResponse.json(
      { error: "Vaste last ontbreekt." },
      { status: 400 },
    );
  }

  if (action !== "confirm" && action !== "skip") {
    return NextResponse.json({ error: "Actie is ongeldig." }, { status: 400 });
  }

  const amount =
    typeof body.amount === "number" && Number.isFinite(body.amount)
      ? body.amount
      : null;
  const note = typeof body.note === "string" && body.note.trim()
    ? body.note.trim()
    : null;

  if (action === "confirm" && amount !== null && amount <= 0) {
    return NextResponse.json(
      { error: "Bedrag moet groter zijn dan nul." },
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

  const { data: instance, error: instanceError } = await supabase
    .from("fixed_expense_instances")
    .select("*")
    .eq("id", body.instanceId)
    .single();

  if (instanceError) {
    return NextResponse.json({ error: instanceError.message }, { status: 400 });
  }

  if (instance.status !== "pending") {
    return NextResponse.json(
      { error: "Deze vaste last is al verwerkt." },
      { status: 409 },
    );
  }

  if (action === "skip") {
    const { data: skippedInstance, error } = await supabase
      .from("fixed_expense_instances")
      .update({
        status: "skipped",
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
        note: note ?? "Overgeslagen",
      })
      .eq("id", body.instanceId)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      fixedInstance: mapFixedInstance(skippedInstance),
      transaction: null,
    });
  }

  const adjustedAmount =
    amount !== null && Math.abs(amount - Number(instance.amount_snapshot)) > 0.004
      ? amount
      : null;
  const fixedNote = note ?? (adjustedAmount ? "Aangepast bedrag" : null);
  const { data, error } = await supabase.rpc("confirm_fixed_expense_instance", {
    target_instance_id: body.instanceId,
    target_amount: adjustedAmount,
    target_note: fixedNote,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data: fixedInstance } = await supabase
    .from("fixed_expense_instances")
    .select("*")
    .eq("id", body.instanceId)
    .single();

  return NextResponse.json({
    fixedInstance: fixedInstance ? mapFixedInstance(fixedInstance) : null,
    transaction: {
      id: data.id,
      amount: Number(data.amount),
      date: data.transaction_date,
      note: data.note ?? undefined,
    },
  });
}

function mapFixedInstance(row: {
  id: string;
  recurring_expense_id: string;
  month: string;
  name_snapshot: string;
  category_id: string;
  amount_snapshot: number;
  status: "pending" | "confirmed" | "adjusted" | "skipped";
  note: string | null;
}): FixedExpenseInstance {
  return {
    id: row.id,
    recurringExpenseId: row.recurring_expense_id,
    month: row.month.slice(0, 7),
    name: row.name_snapshot,
    categoryId: row.category_id,
    amount: Number(row.amount_snapshot),
    status: row.status,
    note: row.note ?? undefined,
  };
}
