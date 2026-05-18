import type { Category, Transaction } from "@/lib/types";

export function categoryById(categories: Category[]) {
  return new Map(categories.map((category) => [category.id, category]));
}

export function totalsForMonth(transactions: Transaction[], month: string) {
  const monthTransactions = transactions.filter((transaction) =>
    transaction.date.startsWith(month),
  );

  const fixedTotal = sum(
    monthTransactions
      .filter((transaction) => transaction.type === "fixed")
      .map((transaction) => transaction.amount),
  );
  const variableTotal = sum(
    monthTransactions
      .filter((transaction) => transaction.type === "variable")
      .map((transaction) => transaction.amount),
  );
  const contributionTotal = sum(
    monthTransactions
      .filter((transaction) => transaction.type === "contribution")
      .map((transaction) => transaction.amount),
  );
  const incomeTotal = sum(
    monthTransactions
      .filter((transaction) => transaction.type === "income")
      .map((transaction) => transaction.amount),
  );
  const expenseTotal = fixedTotal + variableTotal;

  return {
    month,
    contributionTotal,
    incomeTotal,
    fixedTotal,
    variableTotal,
    expenseTotal,
    netTotal: contributionTotal + incomeTotal - expenseTotal,
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
        transaction.type !== "contribution" &&
        transaction.type !== "income",
    )
    .forEach((transaction) => {
      grouped.set(
        transaction.categoryId,
        (grouped.get(transaction.categoryId) ?? 0) + transaction.amount,
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
        transaction.date.startsWith(month) &&
        transaction.type !== "contribution" &&
        transaction.type !== "income",
    )
    .reduce(
      (result, transaction) => {
        const person = personForTransaction(transaction);
        result[person] = (result[person] ?? 0) + transaction.amount;
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
        transaction.date.startsWith(month) && transaction.type === "variable",
    )
    .forEach((transaction) => {
      const person = personForTransaction(transaction);
      const personTotals =
        grouped.get(transaction.categoryId) ?? new Map<string, number>();
      personTotals.set(
        person,
        (personTotals.get(person) ?? 0) + transaction.amount,
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
          .map((transaction) => transaction.amount),
      ),
      variable: sum(
        monthTransactions
          .filter((transaction) => transaction.type === "variable")
          .map((transaction) => transaction.amount),
      ),
      contribution: sum(
        monthTransactions
          .filter((transaction) => transaction.type === "contribution")
          .map((transaction) => transaction.amount),
      ),
      income: sum(
        monthTransactions
          .filter((transaction) => transaction.type === "income")
          .map((transaction) => transaction.amount),
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
