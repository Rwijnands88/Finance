import { NextResponse } from "next/server";
import type { AccountBalanceSnapshot } from "@/lib/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type BalanceSnapshotBody = {
  householdId?: string;
  accountId?: string;
  balance?: number;
  snapshotDate?: string;
  note?: string | null;
};

export async function POST(request: Request) {
  const body = (await request.json()) as BalanceSnapshotBody;
  const balance = Number(body.balance);

  if (
    !body.householdId ||
    !body.accountId ||
    Number.isNaN(balance) ||
    !body.snapshotDate
  ) {
    return NextResponse.json(
      { error: "Vul rekening, saldo en datum in." },
      { status: 400 },
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.snapshotDate)) {
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

  const { data: snapshot, error } = await supabase
    .from("account_balance_snapshots")
    .insert({
      household_id: body.householdId,
      account_id: body.accountId,
      balance,
      snapshot_date: body.snapshotDate,
      note: body.note || null,
      entered_by: user.id,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    snapshot: await mapSnapshot(supabase, snapshot),
  });
}

async function mapSnapshot(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  row: {
    id: string;
    account_id: string;
    balance: number;
    snapshot_date: string;
    note: string | null;
    entered_by: string;
  },
): Promise<AccountBalanceSnapshot> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", row.entered_by)
    .maybeSingle();

  return {
    id: row.id,
    accountId: row.account_id,
    balance: Number(row.balance),
    snapshotDate: row.snapshot_date,
    note: row.note ?? undefined,
    enteredById: row.entered_by,
    enteredBy: profile?.display_name ?? "Onbekend",
  };
}
