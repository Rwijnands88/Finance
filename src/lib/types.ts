export type Person = "Ralph" | "Dorine";

export type CategoryKind = "fixed" | "variable" | "both";

export type Category = {
  id: string;
  name: string;
  kind: CategoryKind;
  color: string;
  averageMonthly: number;
};

export type RecurringExpense = {
  id: string;
  name: string;
  categoryId: string;
  currentAmount: number;
  startsOn: string;
  isActive: boolean;
};

export type FixedExpenseInstance = {
  id: string;
  recurringExpenseId: string;
  month: string;
  name: string;
  categoryId: string;
  amount: number;
  status: "pending" | "confirmed" | "adjusted" | "skipped";
  confirmedBy?: Person;
  note?: string;
};

export type Transaction = {
  id: string;
  type: "fixed" | "variable";
  categoryId: string;
  amount: number;
  date: string;
  note?: string;
  enteredBy: Person;
  fixedInstanceId?: string;
  fuel?: {
    vehicle: "Gezinsauto";
    liters: number;
  };
};

export type MonthSummary = {
  month: string;
  fixedTotal: number;
  variableTotal: number;
  total: number;
};
