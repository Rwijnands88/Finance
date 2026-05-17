import { NextResponse } from "next/server";
import type { ContributionKind, FixedExpenseInstance } from "@/lib/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type CreateTransactionBody = {
  householdId?: string;
  accountId?: string | null;
  categoryId?: string;
  amount?: number;
  date?: string;
  note?: string | null;
  receiptUrl?: string | null;
  type?: "variable" | "contribution" | "income";
  contributionKind?: ContributionKind | null;
  paidById?: string | null;
  incomeKind?: "salary" | "extra";
};

type DeleteTransactionBody = {
  transactionId?: string;
};

type UpdateTransactionBody = {
  transactionId?: string;
  categoryId?: string;
  amount?: number;
  date?: string;
  note?: string | null;
  contributionKind?: ContributionKind | null;
  paidById?: string | null;
};

export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("month");

  if (!month || !isIsoMonth(month)) {
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
    .select("id, name, kind")
    .eq("household_id", membership.household_id)
    .eq("is_active", true);

  if (accountsError) {
    return NextResponse.json({ error: accountsError.message }, { status: 400 });
  }

  const monthStart = `${month}-01`;
  const from = addMonths(monthStart, -5);
  const to = addMonths(monthStart, 1);
  const accountMap = new Map(
    (accounts ?? []).map((account) => [account.id, account]),
  );
  const fallbackAccount =
    accounts?.find((account) => account.kind === "shared") ?? accounts?.[0];
  const { data, error } = await supabase
    .from("transactions")
    .select(
      "*, entered_profile:profiles!transactions_entered_by_fkey(display_name), paid_profile:profiles!transactions_paid_by_fkey(display_name)",
    )
    .eq("household_id", membership.household_id)
    .gte("transaction_date", from)
    .lt("transaction_date", to)
    .order("transaction_date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    transactions: (data ?? []).map((transaction) => {
      const enteredProfile = Array.isArray(transaction.entered_profile)
        ? transaction.entered_profile[0]
        : transaction.entered_profile;
      const paidProfile = Array.isArray(transaction.paid_profile)
        ? transaction.paid_profile[0]
        : transaction.paid_profile;
      const account =
        accountMap.get(transaction.account_id ?? "") ?? fallbackAccount;

      return {
        id: transaction.id,
        type: transaction.type,
        accountId: transaction.account_id ?? fallbackAccount?.id,
        accountName: account?.name,
        accountKind: account?.kind,
        categoryId: transaction.category_id,
        amount: Number(transaction.amount),
        date: transaction.transaction_date,
        contributionKind: transaction.contribution_kind ?? undefined,
        note: transaction.note ?? undefined,
        receiptUrl: transaction.receipt_url ?? undefined,
        enteredById: transaction.entered_by,
        enteredBy: enteredProfile?.display_name ?? "Onbekend",
        paidById: transaction.paid_by ?? transaction.entered_by,
        paidBy:
          paidProfile?.display_name ??
          enteredProfile?.display_name ??
          "Onbekend",
        fixedInstanceId: transaction.fixed_expense_instance_id ?? undefined,
      };
    }),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as CreateTransactionBody;
  const amount = Number(body.amount);
  const transactionType = body.type ?? "variable";

  if (
    !body.householdId ||
    !body.date ||
    !amount ||
    amount <= 0 ||
    (transactionType === "variable" && !body.categoryId)
  ) {
    return NextResponse.json(
      { error: "Vul bedrag, categorie en datum in." },
      { status: 400 },
    );
  }

  if (!["variable", "contribution", "income"].includes(transactionType)) {
    return NextResponse.json(
      { error: "Transactietype is ongeldig." },
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

  const contributionKind =
    transactionType === "contribution"
      ? normalizeContributionKind(body.contributionKind)
      : null;

  if (transactionType === "contribution" && !contributionKind) {
    return NextResponse.json(
      { error: "Stortingstype is ongeldig." },
      { status: 400 },
    );
  }
  const paidById =
    typeof body.paidById === "string" && body.paidById
      ? body.paidById
      : user.id;

  const { data: paidByMembership, error: paidByError } = await supabase
    .from("household_members")
    .select("user_id")
    .eq("household_id", body.householdId)
    .eq("user_id", paidById)
    .limit(1)
    .maybeSingle();

  if (paidByError || !paidByMembership) {
    return NextResponse.json(
      { error: paidByError?.message ?? "Betaler hoort niet bij dit huishouden." },
      { status: 400 },
    );
  }

  let categoryId = body.categoryId!;

  if (transactionType === "contribution") {
    try {
      categoryId = await getOrCreateContributionCategory(
        supabase,
        body.householdId,
      );
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Stortingencategorie kon niet worden gemaakt.",
        },
        { status: 400 },
      );
    }
  }

  if (transactionType === "income") {
    try {
      categoryId = await getOrCreateIncomeCategory(
        supabase,
        body.householdId,
        body.incomeKind === "salary" ? "Salaris" : "Extra inkomsten",
      );
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Inkomstencategorie kon niet worden gemaakt.",
        },
        { status: 400 },
      );
    }
  }

  const { data: transaction, error: transactionError } = await supabase
    .from("transactions")
    .insert({
      household_id: body.householdId,
      account_id: body.accountId || null,
      category_id: categoryId,
      amount,
      transaction_date: body.date,
      type: transactionType,
      contribution_kind: contributionKind,
      note: body.note || null,
      receipt_url:
        typeof body.receiptUrl === "string" && body.receiptUrl.trim()
          ? body.receiptUrl.trim()
          : null,
      entered_by: user.id,
      paid_by: paidById,
    })
    .select("id, account_id, category_id, type, contribution_kind, receipt_url, paid_by")
    .single();

  if (transactionError) {
    return NextResponse.json(
      { error: transactionError.message },
      { status: 400 },
    );
  }

  return NextResponse.json({
    transaction: {
      id: transaction.id,
      accountId: transaction.account_id,
      categoryId: transaction.category_id,
      type: transaction.type,
      contributionKind: transaction.contribution_kind,
      receiptUrl: transaction.receipt_url,
      enteredBy: user.id,
      paidById: transaction.paid_by,
    },
  });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as UpdateTransactionBody;
  const amount = Number(body.amount);

  if (
    typeof body.transactionId !== "string" ||
    typeof body.categoryId !== "string" ||
    !body.date ||
    !amount ||
    amount <= 0
  ) {
    return NextResponse.json(
      { error: "Vul bedrag, categorie en datum in." },
      { status: 400 },
    );
  }

  if (!isIsoDate(body.date)) {
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

  const { data: existingTransaction, error: existingError } = await supabase
    .from("transactions")
    .select("id, household_id, type, fixed_expense_instance_id")
    .eq("id", body.transactionId)
    .single();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 400 });
  }

  const paidById =
    typeof body.paidById === "string" && body.paidById
      ? body.paidById
      : user.id;

  const [{ data: category }, { data: paidByMembership, error: paidByError }] =
    await Promise.all([
      supabase
        .from("categories")
        .select("id")
        .eq("id", body.categoryId)
        .eq("household_id", existingTransaction.household_id)
        .maybeSingle(),
      supabase
        .from("household_members")
        .select("user_id")
        .eq("household_id", existingTransaction.household_id)
        .eq("user_id", paidById)
        .limit(1)
        .maybeSingle(),
    ]);

  if (!category) {
    return NextResponse.json({ error: "Categorie is ongeldig." }, { status: 400 });
  }

  if (paidByError || !paidByMembership) {
    return NextResponse.json(
      { error: paidByError?.message ?? "Betaler hoort niet bij dit huishouden." },
      { status: 400 },
    );
  }

  const note =
    typeof body.note === "string" && body.note.trim()
      ? body.note.trim()
      : null;
  const contributionKind =
    existingTransaction.type === "contribution"
      ? normalizeContributionKind(body.contributionKind)
      : null;

  if (existingTransaction.type === "contribution" && !contributionKind) {
    return NextResponse.json(
      { error: "Stortingstype is ongeldig." },
      { status: 400 },
    );
  }

  const { data: transaction, error: updateError } = await supabase
    .from("transactions")
    .update({
      category_id: body.categoryId,
      amount,
      transaction_date: body.date,
      note,
      paid_by: paidById,
      contribution_kind: contributionKind,
    })
    .eq("id", body.transactionId)
    .select("id, category_id, amount, transaction_date, note, paid_by, contribution_kind")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  let fixedInstance: FixedExpenseInstance | null = null;

  if (
    existingTransaction.type === "fixed" &&
    existingTransaction.fixed_expense_instance_id
  ) {
    const { data: fixedRow, error: fixedError } = await supabase
      .from("fixed_expense_instances")
      .update({
        category_id: body.categoryId,
        amount_snapshot: amount,
        status: "adjusted",
        note,
      })
      .eq("id", existingTransaction.fixed_expense_instance_id)
      .select("*")
      .single();

    if (fixedError) {
      return NextResponse.json({ error: fixedError.message }, { status: 400 });
    }

    fixedInstance = mapFixedInstance(fixedRow);
  }

  return NextResponse.json({
    transaction: {
      id: transaction.id,
      categoryId: transaction.category_id,
      amount: Number(transaction.amount),
      date: transaction.transaction_date,
      note: transaction.note ?? undefined,
      paidById: transaction.paid_by,
      contributionKind: transaction.contribution_kind,
    },
    fixedInstance,
  });
}

async function getOrCreateIncomeCategory(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  householdId: string,
  name: "Salaris" | "Extra inkomsten",
) {
  const { data: existingCategory, error: existingError } = await supabase
    .from("categories")
    .select("id")
    .eq("household_id", householdId)
    .eq("name", name)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existingCategory) {
    return existingCategory.id;
  }

  const { data: category, error } = await supabase
    .from("categories")
    .insert({
      household_id: householdId,
      name,
      kind: "variable",
      color: name === "Salaris" ? "#10B981" : "#22C55E",
      sort_order: name === "Salaris" ? 105 : 110,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return category.id;
}

async function getOrCreateContributionCategory(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  householdId: string,
) {
  const { data: existingCategory, error: existingError } = await supabase
    .from("categories")
    .select("id")
    .eq("household_id", householdId)
    .eq("name", "Inleg")
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existingCategory) {
    return existingCategory.id;
  }

  const { data: category, error } = await supabase
    .from("categories")
    .insert({
      household_id: householdId,
      name: "Inleg",
      kind: "variable",
      color: "#34D399",
      sort_order: 115,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return category.id;
}

export async function DELETE(request: Request) {
  const body = (await request.json()) as DeleteTransactionBody;

  if (typeof body.transactionId !== "string") {
    return NextResponse.json(
      { error: "Afschrijving ontbreekt." },
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

  const { data: transaction, error: transactionError } = await supabase
    .from("transactions")
    .select("id, type, fixed_expense_instance_id, receipt_url")
    .eq("id", body.transactionId)
    .single();

  if (transactionError) {
    return NextResponse.json(
      { error: transactionError.message },
      { status: 400 },
    );
  }

  if (transaction.receipt_url) {
    await supabase.storage.from("receipts").remove([transaction.receipt_url]);
  }

  const { error: deleteError } = await supabase
    .from("transactions")
    .delete()
    .eq("id", body.transactionId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  if (transaction.type !== "fixed" || !transaction.fixed_expense_instance_id) {
    return NextResponse.json({ fixedInstance: null });
  }

  const { data: fixedInstance, error: fixedError } = await supabase
    .from("fixed_expense_instances")
    .update({
      status: "pending",
      confirmed_by: null,
      confirmed_at: null,
      note: null,
    })
    .eq("id", transaction.fixed_expense_instance_id)
    .select("*")
    .single();

  if (fixedError) {
    return NextResponse.json({ error: fixedError.message }, { status: 400 });
  }

  return NextResponse.json({
    fixedInstance: mapFixedInstance(fixedInstance),
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

function isIsoMonth(value: string) {
  return /^\d{4}-\d{2}$/.test(value);
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeContributionKind(
  value: CreateTransactionBody["contributionKind"],
): ContributionKind | null {
  if (
    value === "planned" ||
    value === "extra" ||
    value === "belastingteruggave"
  ) {
    return value;
  }

  return null;
}

function addMonths(isoDate: string, months: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setMonth(date.getMonth() + months);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
