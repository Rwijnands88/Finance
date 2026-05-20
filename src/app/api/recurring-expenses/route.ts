import { NextResponse } from "next/server";
import type { FixedExpenseInstance, RecurringExpense } from "@/lib/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof getSupabaseServerClient>>;

const JOINT_CONTRIBUTION_FIXED_CATEGORY_ID = "__joint_contribution_fixed__";
const JOINT_CONTRIBUTION_FIXED_CATEGORY_NAME = "Inleg gezamenlijk";
const JOINT_CONTRIBUTION_FIXED_CATEGORY_COLOR = "#6366F1";

type RecurringExpenseBody = {
  id?: string | null;
  householdId?: string;
  accountId?: string;
  name?: string;
  categoryId?: string;
  currentAmount?: number;
  billingDay?: number;
  startsOn?: string;
  isActive?: boolean;
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

  const monthStart = `${month}-01`;

  await supabase.rpc("create_fixed_instances_for_month", {
    target_household_id: membership.household_id,
    target_month: monthStart,
  });

  const [recurringResult, fixedInstancesResult] = await Promise.all([
    supabase
      .from("recurring_expenses")
      .select("*")
      .eq("household_id", membership.household_id)
      .order("name", { ascending: true }),
    supabase
      .from("fixed_expense_instances")
      .select("*")
      .eq("household_id", membership.household_id)
      .eq("month", monthStart)
      .order("name_snapshot", { ascending: true }),
  ]);

  if (recurringResult.error) {
    return NextResponse.json(
      { error: recurringResult.error.message },
      { status: 400 },
    );
  }

  if (fixedInstancesResult.error) {
    return NextResponse.json(
      { error: fixedInstancesResult.error.message },
      { status: 400 },
    );
  }

  return NextResponse.json({
    recurringExpenses: (recurringResult.data ?? []).map(mapRecurringExpense),
    fixedInstances: (fixedInstancesResult.data ?? []).map(mapFixedInstance),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as RecurringExpenseBody;
  const validationError = validateRecurringInput(body, true);

  if (validationError) {
    return validationError;
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  const categoryResolution = await resolveRecurringCategory(
    supabase,
    body.householdId!,
    body.categoryId!,
  );

  if (categoryResolution instanceof NextResponse) {
    return categoryResolution;
  }

  const categoryError = await validateCategory(
    body.householdId!,
    categoryResolution.id,
  );

  if (categoryError) {
    return categoryError;
  }

  const { data: recurringExpense, error } = await supabase
    .from("recurring_expenses")
    .insert({
      household_id: body.householdId!,
      account_id: body.accountId ?? null,
      name: body.name!.trim(),
      category_id: categoryResolution.id,
      current_amount: Number(body.currentAmount),
      billing_day: body.billingDay ?? dayFromIsoDate(body.startsOn!),
      starts_on: body.startsOn!,
      is_active: true,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const fixedInstance = await createOrReadCurrentInstance(
    body.householdId!,
    recurringExpense.id,
  );

  return NextResponse.json({
    recurringExpense: mapRecurringExpense(recurringExpense),
    fixedInstance,
    category: categoryResolution.category,
  });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as RecurringExpenseBody;

  if (!body.id || !body.householdId) {
    return NextResponse.json(
      { error: "Vaste last ontbreekt." },
      { status: 400 },
    );
  }

  const validationError = validateRecurringInput(body, false);

  if (validationError) {
    return validationError;
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  const categoryResolution = body.categoryId
    ? await resolveRecurringCategory(supabase, body.householdId, body.categoryId)
    : null;

  if (categoryResolution instanceof NextResponse) {
    return categoryResolution;
  }

  if (categoryResolution) {
    const categoryError = await validateCategory(
      body.householdId,
      categoryResolution.id,
    );

    if (categoryError) {
      return categoryError;
    }
  }

  const updates: {
    name?: string;
    category_id?: string;
    current_amount?: number;
    billing_day?: number;
    starts_on?: string;
    is_active?: boolean;
  } = {};

  if (typeof body.name === "string") {
    updates.name = body.name.trim();
  }

  if (categoryResolution) {
    updates.category_id = categoryResolution.id;
  }

  if (typeof body.currentAmount === "number") {
    updates.current_amount = Number(body.currentAmount);
  }

  if (typeof body.billingDay === "number") {
    updates.billing_day = body.billingDay;
  }

  if (typeof body.startsOn === "string") {
    updates.starts_on = body.startsOn;
  }

  if (typeof body.isActive === "boolean") {
    updates.is_active = body.isActive;
  }

  const { data: recurringExpense, error } = await supabase
    .from("recurring_expenses")
    .update(updates)
    .eq("id", body.id)
    .eq("household_id", body.householdId)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const fixedInstance = await updatePendingCurrentInstance(
    recurringExpense.id,
    recurringExpense.name,
    recurringExpense.category_id,
    Number(recurringExpense.current_amount),
  );

  return NextResponse.json({
    recurringExpense: mapRecurringExpense(recurringExpense),
    fixedInstance,
    category: categoryResolution?.category,
  });
}

export async function DELETE(request: Request) {
  const body = (await request.json()) as RecurringExpenseBody;

  if (!body.id || !body.householdId) {
    return NextResponse.json(
      { error: "Vaste last ontbreekt." },
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

  const { data: existingExpense, error: existingError } = await supabase
    .from("recurring_expenses")
    .select("starts_on")
    .eq("id", body.id)
    .eq("household_id", body.householdId)
    .single();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const endsOn =
    existingExpense.starts_on > today ? existingExpense.starts_on : today;

  const { data: recurringExpense, error } = await supabase
    .from("recurring_expenses")
    .update({
      is_active: false,
      ends_on: endsOn,
    })
    .eq("id", body.id)
    .eq("household_id", body.householdId)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (recurringExpense.is_active) {
    return NextResponse.json(
      { error: "Vaste last kon niet worden verwijderd." },
      { status: 400 },
    );
  }

  const { data: removedInstances, error: instancesError } = await supabase
    .from("fixed_expense_instances")
    .delete()
    .eq("recurring_expense_id", body.id)
    .eq("status", "pending")
    .gte("month", currentMonthStart())
    .select("id");

  if (instancesError) {
    return NextResponse.json({ error: instancesError.message }, { status: 400 });
  }

  return NextResponse.json({
    recurringExpense: mapRecurringExpense(recurringExpense),
    removedRecurringExpenseId: body.id,
    removedInstanceIds: (removedInstances ?? []).map((item) => item.id),
  });
}

function validateRecurringInput(
  body: RecurringExpenseBody,
  requireAllFields: boolean,
) {
  const hasEditableFields =
    typeof body.name === "string" ||
    typeof body.categoryId === "string" ||
    typeof body.currentAmount === "number" ||
    typeof body.billingDay === "number" ||
    typeof body.startsOn === "string" ||
    typeof body.isActive === "boolean";

  if (!hasEditableFields) {
    return NextResponse.json(
      { error: "Geen wijziging ontvangen." },
      { status: 400 },
    );
  }

  if (requireAllFields && (!body.householdId || !body.name || !body.categoryId)) {
    return NextResponse.json(
      { error: "Vul naam, categorie en maandbedrag in." },
      { status: 400 },
    );
  }

  if (typeof body.name === "string" && !body.name.trim()) {
    return NextResponse.json({ error: "Naam ontbreekt." }, { status: 400 });
  }

  if (
    typeof body.currentAmount === "number" &&
    (!body.currentAmount || body.currentAmount <= 0)
  ) {
    return NextResponse.json(
      { error: "Maandbedrag moet groter zijn dan nul." },
      { status: 400 },
    );
  }

  if (
    typeof body.startsOn === "string" &&
    !/^\d{4}-\d{2}-\d{2}$/.test(body.startsOn)
  ) {
    return NextResponse.json({ error: "Startdatum is ongeldig." }, { status: 400 });
  }

  if (
    typeof body.billingDay === "number" &&
    (!Number.isInteger(body.billingDay) ||
      body.billingDay < 1 ||
      body.billingDay > 31)
  ) {
    return NextResponse.json(
      { error: "Afschrijfdag moet tussen 1 en 31 liggen." },
      { status: 400 },
    );
  }

  if (
    requireAllFields &&
    (typeof body.currentAmount !== "number" ||
      !body.startsOn ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.startsOn))
  ) {
    return NextResponse.json(
      { error: "Vul een geldig maandbedrag en startdatum in." },
      { status: 400 },
    );
  }

  return null;
}

async function validateCategory(householdId: string, categoryId: string) {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id")
    .eq("id", categoryId)
    .eq("household_id", householdId)
    .in("kind", ["fixed", "both"])
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!data) {
    return NextResponse.json(
      { error: "Categorie hoort niet bij vaste lasten." },
      { status: 400 },
    );
  }

  return null;
}

type CategoryRow = {
  id: string;
  name: string;
  kind: "fixed" | "variable" | "both";
  color: string;
  sort_order: number | null;
};

async function resolveRecurringCategory(
  supabase: SupabaseClient,
  householdId: string,
  categoryId: string,
) {
  if (categoryId !== JOINT_CONTRIBUTION_FIXED_CATEGORY_ID) {
    return { id: categoryId, category: undefined };
  }

  const { data: existingCategory, error: existingError } = await supabase
    .from("categories")
    .select("id, name, kind, color, sort_order")
    .eq("household_id", householdId)
    .ilike("name", JOINT_CONTRIBUTION_FIXED_CATEGORY_NAME)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 400 });
  }

  if (existingCategory) {
    if (existingCategory.kind === "fixed" || existingCategory.kind === "both") {
      return {
        id: existingCategory.id,
        category: mapCategory(existingCategory),
      };
    }

    const { data: category, error } = await supabase
      .from("categories")
      .update({ kind: "both" })
      .eq("id", existingCategory.id)
      .eq("household_id", householdId)
      .select("id, name, kind, color, sort_order")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return {
      id: category.id,
      category: mapCategory(category),
    };
  }

  const { data: lastCategory, error: lastCategoryError } = await supabase
    .from("categories")
    .select("sort_order")
    .eq("household_id", householdId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastCategoryError) {
    return NextResponse.json(
      { error: lastCategoryError.message },
      { status: 400 },
    );
  }

  const sortOrder = Math.max(200, (lastCategory?.sort_order ?? 190) + 10);
  const { data: category, error } = await supabase
    .from("categories")
    .insert({
      household_id: householdId,
      name: JOINT_CONTRIBUTION_FIXED_CATEGORY_NAME,
      kind: "fixed",
      color: JOINT_CONTRIBUTION_FIXED_CATEGORY_COLOR,
      sort_order: sortOrder,
    })
    .select("id, name, kind, color, sort_order")
    .single();

  if (error) {
    return NextResponse.json(
      {
        error:
          error.code === "23505"
            ? "Deze categorie bestaat al."
            : error.message,
      },
      { status: error.code === "23505" ? 409 : 400 },
    );
  }

  return {
    id: category.id,
    category: mapCategory(category),
  };
}

function mapCategory(category: CategoryRow) {
  return {
    id: category.id,
    name: category.name,
    kind: category.kind,
    color: category.color,
    sortOrder: category.sort_order ?? undefined,
    averageMonthly: 0,
  };
}

async function createOrReadCurrentInstance(
  householdId: string,
  recurringExpenseId: string,
) {
  const supabase = await getSupabaseServerClient();
  const month = currentMonthStart();

  await supabase.rpc("create_fixed_instances_for_month", {
    target_household_id: householdId,
    target_month: month,
  });

  const { data } = await supabase
    .from("fixed_expense_instances")
    .select("*")
    .eq("recurring_expense_id", recurringExpenseId)
    .eq("month", month)
    .maybeSingle();

  return data ? mapFixedInstance(data) : null;
}

async function updatePendingCurrentInstance(
  recurringExpenseId: string,
  name: string,
  categoryId: string,
  amount: number,
) {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("fixed_expense_instances")
    .update({
      name_snapshot: name,
      category_id: categoryId,
      amount_snapshot: amount,
    })
    .eq("recurring_expense_id", recurringExpenseId)
    .eq("month", currentMonthStart())
    .eq("status", "pending")
    .select("*");

  if (error || !data?.[0]) {
    return null;
  }

  return mapFixedInstance(data[0]);
}

function mapRecurringExpense(row: {
  id: string;
  account_id: string | null;
  name: string;
  category_id: string;
  current_amount: number;
  billing_day: number;
  starts_on: string;
  is_active: boolean;
}): RecurringExpense {
  return {
    id: row.id,
    accountId: row.account_id ?? undefined,
    name: row.name,
    categoryId: row.category_id,
    currentAmount: Number(row.current_amount),
    billingDay: row.billing_day,
    startsOn: row.starts_on,
    isActive: row.is_active,
  };
}

function dayFromIsoDate(isoDate: string) {
  return Number(isoDate.slice(8, 10));
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
  profiles?:
    | { display_name?: string | null }
    | Array<{ display_name?: string | null }>
    | null;
}): FixedExpenseInstance {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

  return {
    id: row.id,
    recurringExpenseId: row.recurring_expense_id,
    month: row.month.slice(0, 7),
    name: row.name_snapshot,
    categoryId: row.category_id,
    amount: Number(row.amount_snapshot),
    status: row.status,
    confirmedBy: profile?.display_name ?? undefined,
    note: row.note ?? undefined,
  };
}

function currentMonthStart() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    "01",
  ].join("-");
}

function isIsoMonth(value: string) {
  return /^\d{4}-\d{2}$/.test(value);
}
