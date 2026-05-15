export type Person = string;

export type CategoryKind = "fixed" | "variable" | "both";

export type Category = {
  id: string;
  name: string;
  kind: CategoryKind;
  color: string;
  averageMonthly: number;
};

export type Account = {
  id: string;
  name: string;
  kind: "shared" | "personal";
  ownerUserId?: string;
};

export type RecurringExpense = {
  id: string;
  accountId?: string;
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
  accountId?: string;
  accountName?: string;
  accountKind?: Account["kind"];
  categoryId: string;
  amount: number;
  date: string;
  note?: string;
  enteredBy: Person;
  fixedInstanceId?: string;
  fuel?: {
    vehicle: string;
    liters: number;
  };
};

export type Vehicle = {
  id: string;
  name: string;
};

export type DashboardData = {
  householdId: string;
  currentUserId: string;
  currentPerson: Person;
  selectedMonth: string;
  people: Person[];
  accounts: Account[];
  vehicles: Vehicle[];
  categories: Category[];
  recurringExpenses: RecurringExpense[];
  fixedInstances: FixedExpenseInstance[];
  transactions: Transaction[];
  sixMonthTrend: Array<{
    month: string;
    fixed: number;
    variable: number;
  }>;
};

export type MonthSummary = {
  month: string;
  fixedTotal: number;
  variableTotal: number;
  total: number;
};
