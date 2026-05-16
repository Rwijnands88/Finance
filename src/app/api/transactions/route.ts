import { NextResponse } from "next/server";
import type { FixedExpenseInstance } from "@/lib/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type CreateTransactionBody = {
  householdId?: string;
  accountId?: string | null;
  categoryId?: string;
  amount?: number;
  date?: string;
  note?: string | null;
  type?: "variable" | "contribution" | "income";
  incomeKind?: "salary" | "extra";
};

type DeleteTransactionBody = {
  transactionId?: string;
};

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
              : "Inlegcategorie kon niet worden gemaakt.",
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
      note: body.note || null,
      entered_by: user.id,
    })
    .select("id, account_id, category_id, type")
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
      enteredBy: user.id,
    },
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
    .select("id, type, fixed_expense_instance_id")
    .eq("id", body.transactionId)
    .single();

  if (transactionError) {
    return NextResponse.json(
      { error: transactionError.message },
      { status: 400 },
    );
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
