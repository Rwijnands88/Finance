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

  return {
    month,
    fixedTotal,
    variableTotal,
    total: fixedTotal + variableTotal,
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
    .filter((transaction) => transaction.date.startsWith(month))
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
    .filter((transaction) => transaction.date.startsWith(month))
    .reduce(
      (result, transaction) => {
        result[transaction.enteredBy] += transaction.amount;
        return result;
      },
      { Ralph: 0, Dorine: 0 },
    );
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
