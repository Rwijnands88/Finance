import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type CreateTransactionBody = {
  householdId?: string;
  categoryId?: string;
  amount?: number;
  date?: string;
  note?: string | null;
  fuel?: {
    vehicleId?: string;
    vehicleName?: string;
    liters?: number;
  } | null;
};

export async function POST(request: Request) {
  const body = (await request.json()) as CreateTransactionBody;
  const amount = Number(body.amount);

  if (!body.householdId || !body.categoryId || !body.date || !amount || amount <= 0) {
    return NextResponse.json(
      { error: "Vul bedrag, categorie en datum in." },
      { status: 400 },
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    return NextResponse.json({ error: "Datum is ongeldig." }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  const { data: transaction, error: transactionError } = await supabase
    .from("transactions")
    .insert({
      household_id: body.householdId,
      category_id: body.categoryId,
      amount,
      transaction_date: body.date,
      type: "variable",
      note: body.note || null,
      entered_by: user.id,
    })
    .select("id")
    .single();

  if (transactionError) {
    return NextResponse.json(
      { error: transactionError.message },
      { status: 400 },
    );
  }

  if (body.fuel?.vehicleId && body.fuel.liters) {
    const { error: fuelError } = await supabase.from("fuel_details").insert({
      transaction_id: transaction.id,
      vehicle_id: body.fuel.vehicleId,
      liters: body.fuel.liters,
    });

    if (fuelError) {
      return NextResponse.json({ error: fuelError.message }, { status: 400 });
    }
  }

  return NextResponse.json({
    transaction: {
      id: transaction.id,
      enteredBy: user.id,
    },
  });
}
