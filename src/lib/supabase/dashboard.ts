import type { DashboardData, Transaction } from "@/lib/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof getSupabaseServerClient>>;

const monthFormatter = new Intl.DateTimeFormat("nl-NL", { month: "short" });

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  if (!membership) {
    throw new Error("No household found for this user");
  }

  const selectedMonth = currentIsoMonth();
  const monthStart = `${selectedMonth}-01`;
  const monthEnd = addMonths(monthStart, 1);

  await supabase.rpc("create_fixed_instances_for_month", {
    target_household_id: membership.household_id,
    target_month: monthStart,
  });

  const [
    categoriesResult,
    membersResult,
    vehiclesResult,
    recurringResult,
    fixedInstancesResult,
    historicalTransactionsResult,
  ] = await Promise.all([
    supabase
      .from("categories")
      .select("*")
      .eq("household_id", membership.household_id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("household_members")
      .select("user_id, profiles(display_name)")
      .eq("household_id", membership.household_id),
    supabase
      .from("vehicles")
      .select("*")
      .eq("household_id", membership.household_id)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("recurring_expenses")
      .select("*")
      .eq("household_id", membership.household_id)
      .order("name", { ascending: true }),
    supabase
      .from("fixed_expense_instances")
      .select("*, profiles(display_name)")
      .eq("household_id", membership.household_id)
      .eq("month", monthStart)
      .order("name_snapshot", { ascending: true }),
    fetchTransactions(
      supabase,
      membership.household_id,
      addMonths(monthStart, -5),
      monthEnd,
    ),
  ]);

  throwIfError(categoriesResult.error);
  throwIfError(membersResult.error);
  throwIfError(vehiclesResult.error);
  throwIfError(recurringResult.error);
  throwIfError(fixedInstancesResult.error);

  const categories = (categoriesResult.data ?? []).map((category) => ({
    id: category.id,
    name: category.name,
    kind: category.kind,
    color: category.color,
    averageMonthly: averageForCategory(
      historicalTransactionsResult,
      category.id,
      selectedMonth,
    ),
  }));

  const members =
    membersResult.data
      ?.map((member) => {
        const profile = Array.isArray(member.profiles)
          ? member.profiles[0]
          : member.profiles;
        return {
          userId: member.user_id,
          displayName: profile?.display_name,
        };
      })
      .filter(
        (member): member is { userId: string; displayName: string } =>
          Boolean(member.displayName),
      ) ?? [];
  const people = members.map((member) => member.displayName);
  const currentPerson =
    members.find((member) => member.userId === user.id)?.displayName ??
    people[0] ??
    "Onbekend";

  return {
    householdId: membership.household_id,
    currentUserId: user.id,
    currentPerson,
    selectedMonth,
    people,
    vehicles: (vehiclesResult.data ?? []).map((vehicle) => ({
      id: vehicle.id,
      name: vehicle.name,
    })),
    categories,
    recurringExpenses: (recurringResult.data ?? []).map((expense) => ({
      id: expense.id,
      name: expense.name,
      categoryId: expense.category_id,
      currentAmount: Number(expense.current_amount),
      startsOn: expense.starts_on,
      isActive: expense.is_active,
    })),
    fixedInstances: (fixedInstancesResult.data ?? []).map((expense) => {
      const profile = Array.isArray(expense.profiles)
        ? expense.profiles[0]
        : expense.profiles;

      return {
        id: expense.id,
        recurringExpenseId: expense.recurring_expense_id,
        month: expense.month.slice(0, 7),
        name: expense.name_snapshot,
        categoryId: expense.category_id,
        amount: Number(expense.amount_snapshot),
        status: expense.status,
        confirmedBy: profile?.display_name,
        note: expense.note ?? undefined,
      };
    }),
    transactions: historicalTransactionsResult
      .filter((transaction) => transaction.date.startsWith(selectedMonth))
      .sort((a, b) => b.date.localeCompare(a.date)),
    sixMonthTrend: buildSixMonthTrend(historicalTransactionsResult, monthStart),
  };
}

async function fetchTransactions(
  supabase: SupabaseClient,
  householdId: string,
  from: string,
  to: string,
) {
  const { data, error } = await supabase
    .from("transactions")
    .select(
      "*, profiles(display_name), fuel_details(liters, vehicles(name))",
    )
    .eq("household_id", householdId)
    .gte("transaction_date", from)
    .lt("transaction_date", to)
    .order("transaction_date", { ascending: false });

  throwIfError(error);

  return (data ?? []).map((transaction) => {
    const profile = Array.isArray(transaction.profiles)
      ? transaction.profiles[0]
      : transaction.profiles;
    const fuelDetails = Array.isArray(transaction.fuel_details)
      ? transaction.fuel_details[0]
      : transaction.fuel_details;
    const vehicle = fuelDetails?.vehicles
      ? Array.isArray(fuelDetails.vehicles)
        ? fuelDetails.vehicles[0]
        : fuelDetails.vehicles
      : null;

    return {
      id: transaction.id,
      type: transaction.type,
      categoryId: transaction.category_id,
      amount: Number(transaction.amount),
      date: transaction.transaction_date,
      note: transaction.note ?? undefined,
      enteredBy: profile?.display_name ?? "Onbekend",
      fixedInstanceId: transaction.fixed_expense_instance_id ?? undefined,
      fuel: fuelDetails
        ? {
            vehicle: vehicle?.name ?? "Gezinsauto",
            liters: Number(fuelDetails.liters),
          }
        : undefined,
    } satisfies Transaction;
  });
}

function averageForCategory(
  transactions: Transaction[],
  categoryId: string,
  currentMonth: string,
) {
  const monthTotals = new Map<string, number>();

  transactions
    .filter((transaction) => transaction.categoryId === categoryId)
    .forEach((transaction) => {
      const month = transaction.date.slice(0, 7);
      monthTotals.set(month, (monthTotals.get(month) ?? 0) + transaction.amount);
    });

  const historicalTotals = Array.from(monthTotals.entries())
    .filter(([month]) => month !== currentMonth)
    .map(([, total]) => total);

  if (!historicalTotals.length) {
    return monthTotals.get(currentMonth) ?? 0;
  }

  return Math.round(
    historicalTotals.reduce((total, value) => total + value, 0) /
      historicalTotals.length,
  );
}

function buildSixMonthTrend(transactions: Transaction[], currentMonthStart: string) {
  return Array.from({ length: 6 }, (_, index) => {
    const monthStart = addMonths(currentMonthStart, index - 5);
    const month = monthStart.slice(0, 7);
    const monthTransactions = transactions.filter((transaction) =>
      transaction.date.startsWith(month),
    );

    return {
      month: monthFormatter.format(parseIsoDate(monthStart)),
      fixed: sum(
        monthTransactions
          .filter((transaction) => transaction.type === "fixed")
          .map((transaction) => transaction.amount),
      ),
      variable: sum(
        monthTransactions
          .filter((transaction) => transaction.type === "variable")
          .map((transaction) => transaction.amount),
      ),
    };
  });
}

export function currentIsoMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function addMonths(isoDate: string, months: number) {
  const date = parseIsoDate(isoDate);
  date.setMonth(date.getMonth() + months);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function parseIsoDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function throwIfError(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}
