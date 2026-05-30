import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type CreateDegiroPositionBody = {
  name?: string;
  ticker?: string;
  amount?: number;
};

type DeleteDegiroPositionBody = {
  positionId?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as CreateDegiroPositionBody;
  const name = normalizeText(body.name);
  const ticker = normalizeTicker(body.ticker);
  const amount = Number(body.amount);

  if (!name || !ticker || !Number.isFinite(amount) || amount < 0) {
    return NextResponse.json(
      { error: "Vul naam, ticker en aantal in." },
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
    .from("degiro_positions")
    .upsert(
      {
        user_id: user.id,
        naam: name,
        ticker,
        aantal: amount,
      },
      { onConflict: "user_id,ticker" },
    )
    .select("id, user_id, naam, ticker, aantal")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ position: mapDegiroPosition(data) });
}

export async function DELETE(request: Request) {
  const body = (await request.json()) as DeleteDegiroPositionBody;

  if (!body.positionId) {
    return NextResponse.json({ error: "Positie ontbreekt." }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  const { error } = await supabase
    .from("degiro_positions")
    .delete()
    .eq("id", body.positionId)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

function mapDegiroPosition(row: {
  id: string;
  user_id: string;
  naam: string;
  ticker: string;
  aantal: number;
}) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.naam,
    ticker: row.ticker,
    amount: Number(row.aantal),
  };
}

function normalizeText(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function normalizeTicker(value: string | undefined) {
  return normalizeText(value).replace(/\s+/g, "").toUpperCase();
}
