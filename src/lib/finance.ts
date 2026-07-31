import type { Category, Transaction } from "@/lib/types";

export function categoryById(categories: Category[]) {
  return new Map(categories.map((category) => [category.id, category]));
}

export function budgetAmount(transaction: Transaction) {
  const amount = Math.abs(transaction.amount);

  switch (transaction.type) {
    case "fixed":
    case "variable":
    case "sparen":
    case "prepaid":
      return amount;
    case "settlement":
    case "contribution":
    case "income":
      return 0;
    default:
      return 0;
  }
}

export function cashAmount(transaction: Transaction) {
  const amount = Math.abs(transaction.amount);

  switch (transaction.type) {
    case "income":
    case "contribution":
      return amount;
    case "settlement":
      return transaction.settlementDirection === "in"
        ? amount
        : transaction.settlementDirection === "out"
          ? -amount
          : 0;
    case "fixed":
    case "variable":
    case "sparen":
      return -amount;
    case "prepaid":
      return 0;
    default:
      return 0;
  }
}

export function isVariableBudgetTransaction(transaction: Transaction) {
  return transaction.type === "variable" || transaction.type === "prepaid";
}

export function isCategoryBudgetTransaction(transaction: Transaction) {
  return budgetAmount(transaction) > 0;
}

export function transactionTypeLabel(transaction: Transaction) {
  if (transaction.type === "fixed") return "Vaste last";
  if (transaction.type === "variable") return "Variabel";
  if (transaction.type === "prepaid") return "Voorgeschoten";
  if (transaction.type === "settlement") return "Verrekening";
  if (transaction.type === "income") return "Inkomen";
  if (transaction.type === "contribution") return "Storting";
  if (transaction.type === "sparen") return "Sparen";
  return "Transactie";
}

export function totalsForMonth(transactions: Transaction[], month: string) {
  const monthTransactions = transactions.filter((transaction) =>
    transaction.date.startsWith(month),
  );

  const fixedTotal = sum(
    monthTransactions
      .filter((transaction) => transaction.type === "fixed")
      .map(budgetAmount),
  );
  const variableTotal = sum(
    monthTransactions
      .filter(isVariableBudgetTransaction)
      .map(budgetAmount),
  );
  const contributionTotal = sum(
    monthTransactions
      .filter((transaction) => transaction.type === "contribution")
      .map(cashAmount),
  );
  const incomeTotal = sum(
    monthTransactions
      .filter((transaction) => transaction.type === "income")
      .map(cashAmount),
  );
  const savingsTotal = sum(
    monthTransactions
      .filter((transaction) => transaction.type === "sparen")
      .map(budgetAmount),
  );
  const expenseTotal = sum(monthTransactions.map(budgetAmount));
  const accountMutationTotal = sum(
    monthTransactions
      .filter((transaction) => transaction.type === "settlement")
      .map(cashAmount),
  );
  const cashTotal = sum(monthTransactions.map(cashAmount));

  return {
    month,
    contributionTotal,
    incomeTotal,
    fixedTotal,
    variableTotal,
    savingsTotal,
    householdExpenseTotal: expenseTotal,
    accountMutationTotal,
    expenseTotal,
    netTotal: cashTotal,
    total: expenseTotal,
  };
}

export function categoryTotals(
  transactions: Transaction[],
  categories: Category[],
  month: string,
) {
  const labels = categoryById(categories);
  const grouped = new Map<string, number>();

  transactions
    .filter(
      (transaction) =>
        transaction.date.startsWith(month) &&
        isCategoryBudgetTransaction(transaction),
    )
    .forEach((transaction) => {
      const amount = budgetAmount(transaction);

      grouped.set(
        transaction.categoryId,
        (grouped.get(transaction.categoryId) ?? 0) + amount,
      );
    });

  return Array.from(grouped.entries())
    .map(([categoryId, amount]) => {
      const category = labels.get(categoryId);

      return {
        categoryId,
        name: category?.name ?? "Onbekend",
        amount,
        average: category?.averageMonthly ?? 0,
        color: category?.color ?? "#6366F1",
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

export function totalsByPerson(transactions: Transaction[], month: string) {
  return transactions
    .filter(
      (transaction) =>
        transaction.date.startsWith(month) && isVariableBudgetTransaction(transaction),
    )
    .reduce(
      (result, transaction) => {
        const person = personForTransaction(transaction);
        result[person] = (result[person] ?? 0) + budgetAmount(transaction);
        return result;
      },
      {} as Record<string, number>,
    );
}

function personForTransaction(transaction: Transaction) {
  return transaction.paidBy ?? transaction.enteredBy;
}

export function categoryTotalsByPerson(
  transactions: Transaction[],
  categories: Category[],
  month: string,
) {
  const labels = categoryById(categories);
  const grouped = new Map<string, Map<string, number>>();

  transactions
    .filter(
      (transaction) =>
        transaction.date.startsWith(month) && isVariableBudgetTransaction(transaction),
    )
    .forEach((transaction) => {
      const person = personForTransaction(transaction);
      const personTotals =
        grouped.get(transaction.categoryId) ?? new Map<string, number>();
      personTotals.set(
        person,
        (personTotals.get(person) ?? 0) + budgetAmount(transaction),
      );
      grouped.set(transaction.categoryId, personTotals);
    });

  return Array.from(grouped.entries())
    .map(([categoryId, totals]) => {
      const category = labels.get(categoryId);
      const people = Array.from(totals.entries())
        .map(([person, amount]) => ({ person, amount }))
        .sort((a, b) => b.amount - a.amount);

      return {
        categoryId,
        name: category?.name ?? "Onbekend",
        color: category?.color ?? "#6366F1",
        total: people.reduce((sum, item) => sum + item.amount, 0),
        people,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function sixMonthTrend(transactions: Transaction[], currentMonth: string) {
  const currentMonthStart = `${currentMonth}-01`;

  return Array.from({ length: 6 }, (_, index) => {
    const monthStart = addMonths(currentMonthStart, index - 5);
    const month = monthStart.slice(0, 7);
    const monthTransactions = transactions.filter((transaction) =>
      transaction.date.startsWith(month),
    );

    return {
      month: new Intl.DateTimeFormat("nl-NL", { month: "short" }).format(
        parseIsoDate(monthStart),
      ),
      fixed: sum(
        monthTransactions
          .filter((transaction) => transaction.type === "fixed")
          .map(budgetAmount),
      ),
      variable: sum(
        monthTransactions
          .filter(isVariableBudgetTransaction)
          .map(budgetAmount),
      ),
      contribution: sum(
        monthTransactions
          .filter((transaction) => transaction.type === "contribution")
          .map(cashAmount),
      ),
      income: sum(
        monthTransactions
          .filter((transaction) => transaction.type === "income")
          .map(cashAmount),
      ),
    };
  });
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function addMonths(isoDate: string, months: number) {
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
