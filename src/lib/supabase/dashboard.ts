import type {
  Account,
  AccountBalanceSnapshot,
  ContributionPlan,
  CryptoPosition,
  DashboardData,
  DegiroPosition,
  InvestmentSettings,
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
    investmentSettingsResult,
    degiroPositionsResult,
    cryptoPositionsResult,
    balanceSnapshotsResult,
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
	      .order("user_id", { ascending: true })
	      .order("deposit_day", { ascending: true }),
    supabase
      .from("investment_settings")
      .select("user_id, investing_enabled")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("degiro_positions")
      .select("id, user_id, naam, ticker, aantal")
      .eq("user_id", user.id)
      .order("naam", { ascending: true }),
    supabase
      .from("crypto_positions")
      .select("id, user_id, coin_name, coin_id, ticker, amount")
      .eq("user_id", user.id)
      .order("coin_name", { ascending: true }),
    supabase
      .from("account_balance_snapshots")
      .select("*")
      .eq("household_id", membership.household_id)
      .order("snapshot_date", { ascending: false })
      .order("created_at", { ascending: false }),
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
  throwIfErrorUnlessMissingInvestmentSettings(investmentSettingsResult.error);
  throwIfErrorUnlessMissingDegiroPositions(degiroPositionsResult.error);
  throwIfErrorUnlessMissingCryptoPositions(cryptoPositionsResult.error);
  throwIfErrorUnlessMissingBalanceSnapshots(balanceSnapshotsResult.error);
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
    sortOrder: category.sort_order,
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
    currentUserEmail: user.email ?? undefined,
    currentPerson,
    selectedMonth,
    people,
    householdMembers: members.map((member) => ({
      userId: member.userId,
      displayName: member.displayName,
    })),
    accounts,
    contributionPlans: mapContributionPlans(
      contributionPlansResult.data ?? [],
      memberNameByUserId,
    ),
    investmentSettings: mapInvestmentSettings(
      investmentSettingsResult.data,
      user.id,
    ),
    degiroPositions: mapDegiroPositions(degiroPositionsResult.data ?? []),
    cryptoPositions: mapCryptoPositions(cryptoPositionsResult.data ?? []),
    balanceSnapshots: mapBalanceSnapshots(
      balanceSnapshotsResult.data ?? [],
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
    transactions: historicalTransactionsResult.sort((a, b) =>
      b.date.localeCompare(a.date),
    ),
    sixMonthTrend: buildSixMonthTrend(historicalTransactionsResult, monthStart),
  };
}

function mapDegiroPositions(
  rows: Array<{
    id: string;
    user_id: string;
    naam: string;
    ticker: string;
    aantal: number;
  }>,
) {
  return rows.map(
    (position) =>
      ({
        id: position.id,
        userId: position.user_id,
        name: position.naam,
        ticker: position.ticker,
        amount: Number(position.aantal),
      }) satisfies DegiroPosition,
  );
}

function mapCryptoPositions(
  rows: Array<{
    id: string;
    user_id: string;
    coin_name: string;
    coin_id: string;
    ticker: string;
    amount: number;
  }>,
) {
  return rows.map(
    (position) =>
      ({
        id: position.id,
        userId: position.user_id,
        coinName: position.coin_name,
        coinId: position.coin_id,
        ticker: position.ticker,
        amount: Number(position.amount),
      }) satisfies CryptoPosition,
  );
}

function mapInvestmentSettings(
  row:
    | {
        user_id: string;
        investing_enabled: boolean;
      }
    | null,
  currentUserId: string,
) {
  return {
    userId: row?.user_id ?? currentUserId,
    investingEnabled: Boolean(row?.investing_enabled),
  } satisfies InvestmentSettings;
}

function mapBalanceSnapshots(
  rows: Array<{
    id: string;
    account_id: string;
    balance: number;
    snapshot_date: string;
    note: string | null;
    entered_by: string;
  }>,
  memberNameByUserId: Map<string, string>,
) {
  return rows.map(
    (snapshot) =>
      ({
        id: snapshot.id,
        accountId: snapshot.account_id,
        balance: Number(snapshot.balance),
        snapshotDate: snapshot.snapshot_date,
        note: snapshot.note ?? undefined,
        enteredById: snapshot.entered_by,
        enteredBy: memberNameByUserId.get(snapshot.entered_by) ?? "Onbekend",
      }) satisfies AccountBalanceSnapshot,
  );
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
    .select(
      "*, entered_profile:profiles!transactions_entered_by_fkey(display_name), paid_profile:profiles!transactions_paid_by_fkey(display_name)",
    )
    .eq("household_id", householdId)
    .gte("transaction_date", from)
    .lt("transaction_date", to)
    .order("transaction_date", { ascending: false });

  throwIfError(error);

  return (data ?? []).map((transaction) => {
    const enteredProfile = Array.isArray(transaction.entered_profile)
      ? transaction.entered_profile[0]
      : transaction.entered_profile;
    const paidProfile = Array.isArray(transaction.paid_profile)
      ? transaction.paid_profile[0]
      : transaction.paid_profile;

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
    } satisfies Transaction;
  });
}

function mapContributionPlans(
  rows: Array<{
	    id: string;
	    account_id: string;
	    user_id: string;
	    label?: string | null;
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
	        label: plan.label ?? "Reguliere storting",
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

function throwIfErrorUnlessMissingInvestmentSettings(
  error: { code?: string; message: string } | null,
) {
  if (
    !error ||
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.message.includes("investment_settings")
  ) {
    return;
  }

  throw new Error(error.message);
}

function throwIfErrorUnlessMissingDegiroPositions(
  error: { code?: string; message: string } | null,
) {
  if (
    !error ||
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.message.includes("degiro_positions")
  ) {
    return;
  }

  throw new Error(error.message);
}

function throwIfErrorUnlessMissingCryptoPositions(
  error: { code?: string; message: string } | null,
) {
  if (
    !error ||
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.message.includes("crypto_positions")
  ) {
    return;
  }

  throw new Error(error.message);
}

function throwIfErrorUnlessMissingBalanceSnapshots(
  error: { code?: string; message: string } | null,
) {
  if (
    !error ||
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.message.includes("account_balance_snapshots")
  ) {
    return;
  }
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
