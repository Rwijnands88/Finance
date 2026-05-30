import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type CreateCryptoPositionBody = {
  coinName?: string;
  coinId?: string;
  ticker?: string;
  amount?: number;
};

type DeleteCryptoPositionBody = {
  positionId?: string;
};

type UpdateCryptoPositionBody = CreateCryptoPositionBody & {
  positionId?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as CreateCryptoPositionBody;
  const coinName = normalizeText(body.coinName);
  const coinId = normalizeCoinId(body.coinId);
  const ticker = normalizeTicker(body.ticker);
  const amount = Number(body.amount);

  if (!coinName || !coinId || !ticker || !Number.isFinite(amount) || amount < 0) {
    return NextResponse.json(
      { error: "Vul naam, CoinGecko ID, ticker en hoeveelheid in." },
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
    .from("crypto_positions")
    .upsert(
      {
        user_id: user.id,
        coin_name: coinName,
        coin_id: coinId,
        ticker,
        amount,
      },
      { onConflict: "user_id,coin_id" },
    )
    .select("id, user_id, coin_name, coin_id, ticker, amount")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ position: mapCryptoPosition(data) });
}

export async function DELETE(request: Request) {
  const body = (await request.json()) as DeleteCryptoPositionBody;

  if (!body.positionId) {
    return NextResponse.json({ error: "Coin ontbreekt." }, { status: 400 });
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
    .from("crypto_positions")
    .delete()
    .eq("id", body.positionId)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as UpdateCryptoPositionBody;
  const coinName = normalizeText(body.coinName);
  const coinId = normalizeCoinId(body.coinId);
  const ticker = normalizeTicker(body.ticker);
  const amount = Number(body.amount);

  if (!body.positionId) {
    return NextResponse.json({ error: "Coin ontbreekt." }, { status: 400 });
  }

  if (!coinName || !coinId || !ticker || !Number.isFinite(amount) || amount < 0) {
    return NextResponse.json(
      { error: "Vul naam, CoinGecko ID, ticker en hoeveelheid in." },
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
    .from("crypto_positions")
    .update({
      coin_name: coinName,
      coin_id: coinId,
      ticker,
      amount,
    })
    .eq("id", body.positionId)
    .eq("user_id", user.id)
    .select("id, user_id, coin_name, coin_id, ticker, amount")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!data) {
    return NextResponse.json({ error: "Coin niet gevonden." }, { status: 404 });
  }

  return NextResponse.json({ position: mapCryptoPosition(data) });
}

function mapCryptoPosition(row: {
  id: string;
  user_id: string;
  coin_name: string;
  coin_id: string;
  ticker: string;
  amount: number;
}) {
  return {
    id: row.id,
    userId: row.user_id,
    coinName: row.coin_name,
    coinId: row.coin_id,
    ticker: row.ticker,
    amount: Number(row.amount),
  };
}

function normalizeText(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function normalizeCoinId(value: string | undefined) {
  return normalizeText(value).toLowerCase();
}

function normalizeTicker(value: string | undefined) {
  return normalizeText(value).toUpperCase();
}
