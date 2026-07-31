import { NextResponse } from "next/server";
import type { AccountBalanceSnapshot, MonthReconciliation } from "@/lib/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type ReconciliationBody = {
  householdId?: string;
  accountId?: string;
  month?: string;
  actualBalance?: number;
  difference?: number;
  note?: string | null;
  createSnapshot?: boolean;
};

export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("month");

  if (month && !isIsoMonth(month)) {
    return NextResponse.json({ error: "Maand is ongeldig." }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    return NextResponse.json(
      { error: membershipError?.message ?? "Huishouden ontbreekt." },
      { status: 400 },
    );
  }

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id")
    .eq("household_id", membership.household_id)
    .eq("is_active", true);

  if (accountsError) {
    return NextResponse.json({ error: accountsError.message }, { status: 400 });
  }

  const accountIds = (accounts ?? []).map((account) => account.id);

  if (!accountIds.length) {
    return NextResponse.json({ monthReconciliations: [] });
  }

  let query = supabase
    .from("month_reconciliations")
    .select("*")
    .in("account_id", accountIds)
    .order("month", { ascending: false });

  if (month) {
    query = query.eq("month", `${month}-01`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    monthReconciliations: (data ?? []).map(mapReconciliation),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as ReconciliationBody;
  const actualBalance = Number(body.actualBalance);
  const difference = Number(body.difference);
  const note = body.note?.trim() ?? "";
  const isAligned = Number.isFinite(difference) && Math.abs(difference) < 0.005;

  if (
    !body.householdId ||
    !body.accountId ||
    !body.month ||
    !isIsoMonth(body.month) ||
    Number.isNaN(actualBalance)
  ) {
    return NextResponse.json(
      { error: "Vul rekening, maand en werkelijk saldo in." },
      { status: 400 },
    );
  }

  if (!isAligned && !note) {
    return NextResponse.json(
      { error: "Voeg een notitie toe bij een verschil." },
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

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, household_id, kind")
    .eq("id", body.accountId)
    .eq("household_id", body.householdId)
    .maybeSingle();

  if (accountError || !account) {
    return NextResponse.json(
      { error: accountError?.message ?? "Rekening ontbreekt." },
      { status: 400 },
    );
  }

  if (account.kind !== "shared") {
    return NextResponse.json(
      { error: "Maandaansluiting is alleen voor de gezamenlijke rekening." },
      { status: 400 },
    );
  }

  const monthStart = `${body.month}-01`;
  const monthEnd = monthEndDate(body.month);
  const { data: reconciliation, error } = await supabase
    .from("month_reconciliations")
    .upsert(
      {
        account_id: body.accountId,
        month: monthStart,
        actual_balance: actualBalance,
        checked_at: new Date().toISOString(),
        note: note || null,
        entered_by: user.id,
      },
      { onConflict: "account_id,month" },
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  let snapshot: AccountBalanceSnapshot | null = null;

  if (isAligned && body.createSnapshot) {
    const { data: snapshotRow, error: snapshotError } = await supabase
      .from("account_balance_snapshots")
      .insert({
        household_id: body.householdId,
        account_id: body.accountId,
        balance: actualBalance,
        snapshot_date: monthEnd,
        note: `Maandaansluiting ${body.month}`,
        entered_by: user.id,
      })
      .select("*")
      .single();

    if (snapshotError) {
      return NextResponse.json({ error: snapshotError.message }, { status: 400 });
    }

    snapshot = await mapSnapshot(supabase, snapshotRow);
  }

  return NextResponse.json({
    reconciliation: mapReconciliation(reconciliation),
    snapshot,
  });
}

function mapReconciliation(row: {
  id: string;
  account_id: string;
  month: string;
  actual_balance: number;
  checked_at: string;
  note: string | null;
  entered_by: string;
}) {
  return {
    id: row.id,
    accountId: row.account_id,
    month: row.month.slice(0, 7),
    actualBalance: Number(row.actual_balance),
    checkedAt: row.checked_at,
    note: row.note ?? undefined,
    enteredById: row.entered_by,
  } satisfies MonthReconciliation;
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
) {
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
  } satisfies AccountBalanceSnapshot;
}

function isIsoMonth(month: string) {
  return /^\d{4}-\d{2}$/.test(month);
}

function monthEndDate(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber, 0);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
