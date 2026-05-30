export type Person = string;
export type ContributionKind = "planned" | "extra" | "belastingteruggave";

export type CategoryKind = "fixed" | "variable" | "both";

export type Category = {
  id: string;
  name: string;
  kind: CategoryKind;
  color: string;
  averageMonthly: number;
  sortOrder?: number;
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
  billingDay: number;
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
  type: "fixed" | "variable" | "contribution" | "income" | "sparen";
  contributionKind?: ContributionKind;
  accountId?: string;
  accountName?: string;
  accountKind?: Account["kind"];
  categoryId: string;
  amount: number;
  date: string;
  note?: string;
  receiptUrl?: string;
  enteredById?: string;
  enteredBy: Person;
  paidById?: string;
  paidBy?: Person;
  fixedInstanceId?: string;
};

export type AccountBalanceSnapshot = {
  id: string;
  accountId: string;
  balance: number;
  snapshotDate: string;
  note?: string;
  enteredById?: string;
  enteredBy: Person;
};

export type ContributionPlan = {
  id: string;
  accountId: string;
  userId: string;
  person: Person;
  label: string;
  monthlyAmount: number;
  depositDay: number;
  isActive: boolean;
};

export type InvestmentSettings = {
  userId: string;
  degiroTotal: number;
  investingEnabled: boolean;
};

export type CryptoPosition = {
  id: string;
  userId: string;
  coinName: string;
  coinId: string;
  ticker: string;
  amount: number;
};

export type DashboardData = {
  householdId: string;
  currentUserId: string;
  currentUserEmail?: string;
  currentPerson: Person;
  selectedMonth: string;
  people: Person[];
  householdMembers: Array<{
    userId: string;
    displayName: Person;
  }>;
  accounts: Account[];
  categories: Category[];
  contributionPlans: ContributionPlan[];
  investmentSettings: InvestmentSettings;
  cryptoPositions: CryptoPosition[];
  balanceSnapshots: AccountBalanceSnapshot[];
  recurringExpenses: RecurringExpense[];
  fixedInstances: FixedExpenseInstance[];
  transactions: Transaction[];
  sixMonthTrend: Array<{
    month: string;
    fixed: number;
    variable: number;
    contribution?: number;
  }>;
};

export type MonthSummary = {
  month: string;
  contributionTotal: number;
  incomeTotal: number;
  fixedTotal: number;
  variableTotal: number;
  savingsTotal: number;
  expenseTotal: number;
  netTotal: number;
  total: number;
};
