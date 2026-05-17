import type {
  Category,
  FixedExpenseInstance,
  RecurringExpense,
  Transaction,
} from "@/lib/types";

export const people = ["Ralph", "Dorine"] as const;

export const categories: Category[] = [
  { id: "mortgage", name: "Hypotheek", kind: "fixed", color: "#6366F1", averageMonthly: 1840 },
  { id: "internet", name: "Internet & TV", kind: "fixed", color: "#818CF8", averageMonthly: 74 },
  { id: "utilities", name: "Water & elektra", kind: "fixed", color: "#22D3EE", averageMonthly: 260 },
  { id: "subscriptions", name: "Abonnementen", kind: "fixed", color: "#A78BFA", averageMonthly: 92 },
  { id: "childcare", name: "Kinderopvang & BSO", kind: "fixed", color: "#F59E0B", averageMonthly: 910 },
  { id: "insurance", name: "Verzekeringen", kind: "fixed", color: "#F97316", averageMonthly: 315 },
  { id: "tax", name: "Belasting", kind: "fixed", color: "#64748B", averageMonthly: 180 },
  { id: "groceries", name: "Boodschappen", kind: "variable", color: "#10B981", averageMonthly: 820 },
  { id: "fuel", name: "Tanken", kind: "variable", color: "#38BDF8", averageMonthly: 210 },
  { id: "other", name: "Overig", kind: "variable", color: "#EF4444", averageMonthly: 360 },
  { id: "contribution", name: "Stortingen", kind: "variable", color: "#34D399", averageMonthly: 0 },
];

export const recurringExpenses: RecurringExpense[] = [
  { id: "rec-1", name: "Hypotheek", categoryId: "mortgage", currentAmount: 1840, billingDay: 1, startsOn: "2026-01-01", isActive: true },
  { id: "rec-2", name: "Internet + TV", categoryId: "internet", currentAmount: 74, billingDay: 3, startsOn: "2026-01-01", isActive: true },
  { id: "rec-3", name: "Water en elektra voorschot", categoryId: "utilities", currentAmount: 256, billingDay: 8, startsOn: "2026-01-01", isActive: true },
  { id: "rec-4", name: "Kinderopvang", categoryId: "childcare", currentAmount: 645, billingDay: 5, startsOn: "2026-01-01", isActive: true },
  { id: "rec-5", name: "BSO", categoryId: "childcare", currentAmount: 265, billingDay: 15, startsOn: "2026-01-01", isActive: true },
  { id: "rec-6", name: "Verzekeringen pakket", categoryId: "insurance", currentAmount: 315, billingDay: 7, startsOn: "2026-01-01", isActive: true },
  { id: "rec-7", name: "Telefoon Ralph", categoryId: "subscriptions", currentAmount: 31, billingDay: 18, startsOn: "2026-01-01", isActive: true },
  { id: "rec-8", name: "Telefoon Dorine", categoryId: "subscriptions", currentAmount: 29, billingDay: 18, startsOn: "2026-01-01", isActive: true },
];

export const fixedInstances: FixedExpenseInstance[] = [
  { id: "fix-1", recurringExpenseId: "rec-1", month: "2026-05", name: "Hypotheek", categoryId: "mortgage", amount: 1840, status: "confirmed", confirmedBy: "Ralph" },
  { id: "fix-2", recurringExpenseId: "rec-2", month: "2026-05", name: "Internet + TV", categoryId: "internet", amount: 74, status: "confirmed", confirmedBy: "Dorine" },
  { id: "fix-3", recurringExpenseId: "rec-3", month: "2026-05", name: "Water en elektra voorschot", categoryId: "utilities", amount: 256, status: "pending" },
  { id: "fix-4", recurringExpenseId: "rec-4", month: "2026-05", name: "Kinderopvang", categoryId: "childcare", amount: 645, status: "confirmed", confirmedBy: "Dorine" },
  { id: "fix-5", recurringExpenseId: "rec-5", month: "2026-05", name: "BSO", categoryId: "childcare", amount: 265, status: "pending" },
  { id: "fix-6", recurringExpenseId: "rec-6", month: "2026-05", name: "Verzekeringen pakket", categoryId: "insurance", amount: 315, status: "confirmed", confirmedBy: "Ralph" },
];

export const transactions: Transaction[] = [
  { id: "txn-1", type: "fixed", fixedInstanceId: "fix-1", categoryId: "mortgage", amount: 1840, date: "2026-05-01", enteredBy: "Ralph", note: "Automatisch terugkerend" },
  { id: "txn-2", type: "fixed", fixedInstanceId: "fix-2", categoryId: "internet", amount: 74, date: "2026-05-03", enteredBy: "Dorine", note: "Automatisch terugkerend" },
  { id: "txn-3", type: "fixed", fixedInstanceId: "fix-4", categoryId: "childcare", amount: 645, date: "2026-05-05", enteredBy: "Dorine", note: "Automatisch terugkerend" },
  { id: "txn-4", type: "fixed", fixedInstanceId: "fix-6", categoryId: "insurance", amount: 315, date: "2026-05-07", enteredBy: "Ralph", note: "Automatisch terugkerend" },
  { id: "txn-5", type: "variable", categoryId: "groceries", amount: 126.35, date: "2026-05-02", enteredBy: "Dorine", note: "Weekboodschappen" },
  { id: "txn-6", type: "variable", categoryId: "fuel", amount: 82.1, date: "2026-05-04", enteredBy: "Ralph", note: "Tanken" },
  { id: "txn-7", type: "variable", categoryId: "groceries", amount: 54.8, date: "2026-05-08", enteredBy: "Ralph", note: "Aanvulling" },
  { id: "txn-8", type: "variable", categoryId: "other", amount: 39.95, date: "2026-05-09", enteredBy: "Dorine", note: "Cadeau" },
  { id: "txn-9", type: "contribution", categoryId: "contribution", amount: 1600, date: "2026-05-01", enteredBy: "Ralph", note: "Reguliere storting" },
];

export const sixMonthTrend = [
  { month: "Dec", fixed: 3480, variable: 1260 },
  { month: "Jan", fixed: 3510, variable: 1415 },
  { month: "Feb", fixed: 3510, variable: 1330 },
  { month: "Mrt", fixed: 3570, variable: 1505 },
  { month: "Apr", fixed: 3570, variable: 1190 },
  { month: "Mei", fixed: 2874, variable: 303 },
];
