import type {
  Account,
  ContributionPlan,
  DashboardData,
  Transaction,
} from "@/lib/types";
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
    accountsResult,
    membersResult,
    currentProfileResult,
    contributionPlansResult,
    recurringResult,
    fixedInstancesResult,
  ] = await Promise.all([
    supabase
      .from("categories")
      .select("*")
      .eq("household_id", membership.household_id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("accounts")
      .select("*")
      .eq("household_id", membership.household_id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("household_members")
      .select("user_id, profiles(display_name)")
      .eq("household_id", membership.household_id),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("contribution_plans")
      .select("*")
      .eq("household_id", membership.household_id)
      .eq("is_active", true)
      .order("deposit_day", { ascending: true }),
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
  ]);

  throwIfError(categoriesResult.error);
  throwIfError(accountsResult.error);
  throwIfError(membersResult.error);
  throwIfError(currentProfileResult.error);
  throwIfErrorUnlessMissingContributionPlans(contributionPlansResult.error);
  throwIfError(recurringResult.error);
  throwIfError(fixedInstancesResult.error);

  const accounts = (accountsResult.data ?? []).map((account) => ({
    id: account.id,
    name: account.name,
    kind: account.kind,
    ownerUserId: account.owner_user_id ?? undefined,
  })) satisfies Account[];
  const fallbackAccount =
    accounts.find((account) => account.kind === "shared") ?? accounts[0];
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const historicalTransactionsResult = await fetchTransactions(
    supabase,
    membership.household_id,
    addMonths(monthStart, -5),
    monthEnd,
    accountMap,
    fallbackAccount,
  );

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
    currentProfileResult.data?.display_name ??
    members.find((member) => member.userId === user.id)?.displayName ??
    people[0] ??
    "Onbekend";
  const memberNameByUserId = new Map(
    members.map((member) => [member.userId, member.displayName]),
  );

  return {
    householdId: membership.household_id,
    currentUserId: user.id,
    currentPerson,
    selectedMonth,
    people,
    accounts,
    contributionPlans: mapContributionPlans(
      contributionPlansResult.data ?? [],
      memberNameByUserId,
    ),
    categories,
    recurringExpenses: (recurringResult.data ?? []).map((expense) => ({
      id: expense.id,
      accountId: expense.account_id ?? undefined,
      name: expense.name,
      categoryId: expense.category_id,
      currentAmount: Number(expense.current_amount),
      billingDay: expense.billing_day,
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
  accountMap: Map<string, Account>,
  fallbackAccount?: Account,
) {
  const { data, error } = await supabase
    .from("transactions")
    .select("*, profiles(display_name)")
    .eq("household_id", householdId)
    .gte("transaction_date", from)
    .lt("transaction_date", to)
    .order("transaction_date", { ascending: false });

  throwIfError(error);

  return (data ?? []).map((transaction) => {
    const profile = Array.isArray(transaction.profiles)
      ? transaction.profiles[0]
      : transaction.profiles;

    return {
      id: transaction.id,
      type: transaction.type,
      accountId: transaction.account_id ?? fallbackAccount?.id,
      accountName:
        accountMap.get(transaction.account_id ?? "")?.name ??
        fallbackAccount?.name,
      accountKind:
        accountMap.get(transaction.account_id ?? "")?.kind ??
        fallbackAccount?.kind,
      categoryId: transaction.category_id,
      amount: Number(transaction.amount),
      date: transaction.transaction_date,
      note: transaction.note ?? undefined,
      enteredById: transaction.entered_by,
      enteredBy: profile?.display_name ?? "Onbekend",
      fixedInstanceId: transaction.fixed_expense_instance_id ?? undefined,
    } satisfies Transaction;
  });
}

function mapContributionPlans(
  rows: Array<{
    id: string;
    account_id: string;
    user_id: string;
    monthly_amount: number;
    deposit_day: number;
    is_active: boolean;
  }>,
  memberNameByUserId: Map<string, string>,
) {
  return rows.map(
    (plan) =>
      ({
        id: plan.id,
        accountId: plan.account_id,
        userId: plan.user_id,
        person: memberNameByUserId.get(plan.user_id) ?? "Onbekend",
        monthlyAmount: Number(plan.monthly_amount),
        depositDay: plan.deposit_day,
        isActive: plan.is_active,
      }) satisfies ContributionPlan,
  );
}

function throwIfErrorUnlessMissingContributionPlans(
  error: { code?: string; message: string } | null,
) {
  if (!error || error.code === "42P01") return;
  throw new Error(error.message);
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
