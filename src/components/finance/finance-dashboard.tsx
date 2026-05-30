"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  ArrowDownToLine,
  Camera,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Globe,
  ListChecks,
  LoaderCircle,
  LogOut,
  Pencil,
  Plus,
  ReceiptText,
  Save,
  Settings,
  Trash2,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  type AccountBalanceSnapshot,
  type ContributionKind,
  type ContributionPlan,
  type CryptoPosition,
  type DashboardData,
  type DegiroPosition,
  type FixedExpenseInstance,
  type RecurringExpense,
  type Transaction,
} from "@/lib/types";
import {
  categoryById,
  categoryTotalsByPerson,
  categoryTotals,
  sixMonthTrend,
  totalsByPerson,
  totalsForMonth,
} from "@/lib/finance";
import { cn, currency, monthLabel, preciseCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import {
  MonthReportDocument,
  type MonthReportFixedItem,
} from "@/components/finance/month-report-document";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const JOINT_CONTRIBUTION_FIXED_CATEGORY_ID = "__joint_contribution_fixed__";
const JOINT_CONTRIBUTION_FIXED_CATEGORY_NAME = "Inleg gezamenlijk";
const SAVINGS_SNAPSHOT_NOTE = "__finance_savings_snapshot__";
const SAVINGS_CATEGORY_NAME = "Sparen";
const VARIABLE_EXPENSE_COLOR = "#14B8A6";
const SAVINGS_COLOR = "#10B981";

function isSavingsSnapshot(snapshot: Pick<AccountBalanceSnapshot, "note">) {
  return snapshot.note === SAVINGS_SNAPSHOT_NOTE;
}

type ReceiptDraft = {
  amount: number | null;
  date: string | null;
  merchant: string | null;
};

type ReceiptViewerState = {
  url: string;
  title: string;
};

type DashboardMetric = {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string;
  tone: "indigo" | "emerald" | "red" | "zinc";
  valueTone?: "default" | "emerald" | "red";
  progress?: number;
  progressTone?: "emerald" | "orange" | "red";
};

type ActiveSection = "dashboard" | "fixed" | "vermogen" | "input" | "month";
type TransactionDisplayLimit = 10 | 15 | 20 | "all";
type ContributionPlanDraft = {
  label: string;
  amount: string;
  depositDay: string;
};
type ContributionPlanRow = ContributionPlan & {
  received: number;
  remaining: number;
};
type MonthOption = {
  value: string;
  label: string;
};
type MonthDataResponse = {
  transactions?: Transaction[];
  recurringExpenses?: RecurringExpense[];
  fixedInstances?: FixedExpenseInstance[];
  error?: string;
};
type CashflowPoint = {
  day: number;
  balance: number;
};
type CashflowEvent = {
  date: string;
  day: number;
  amount: number;
};
type CashflowStartSnapshot = Pick<
  AccountBalanceSnapshot,
  "balance" | "snapshotDate"
>;
type ContributionCoverageResult = {
  amount: number;
  expectedVariableTotal: number;
  currentVariableTotal: number;
  historyMonths: number;
  dataDays: number;
  tone: "emerald" | "red" | "zinc";
  text: string;
};
type VariableSpendPacingResult = {
  estimatedVariableTotal: number;
  forecastVariableTotal: number;
  currentVariableTotal: number;
  previousMonthTotalToDate: number;
  expectedToDate: number;
  historicalDailyAverage: number;
  remainingDays: number;
  historyMonths: number;
  dataDays: number;
  progress: number;
  previousProgress: number;
  tone: "emerald" | "orange" | "red" | "zinc";
};

type ContributionPersonBreakdown = {
  person: string;
  planned: Array<{
    id: string;
    date: string;
    amount: number;
  }>;
  extra: Array<{
    id: string;
    date: string;
    amount: number;
  }>;
  taxReturn: Array<{
    id: string;
    date: string;
    amount: number;
  }>;
  unknown: Array<{
    id: string;
    date: string;
    amount: number;
  }>;
};

const cashflowBufferStorageKeyPrefix = "finance-cashflow-buffer";

function sectionNavItems() {
  return [
    { id: "dashboard", label: "Overzicht", mobileLabel: "Home", icon: WalletCards },
    { id: "fixed", label: "Lasten", mobileLabel: "Lasten", icon: ListChecks },
    { id: "input", label: "Invoeren", mobileLabel: "Nieuw", icon: Plus },
    { id: "vermogen", label: "Vermogen", mobileLabel: "Vermogen", icon: TrendingUp },
    { id: "month", label: "Maand", mobileLabel: "Maand", icon: CalendarDays },
  ] satisfies Array<{
    id: ActiveSection;
    label: string;
    mobileLabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }>;
}

function scrollToFinanceSection(section: ActiveSection) {
  const mainPanel = document.querySelector<HTMLElement>("[data-finance-main]");
  const contextPanel = document.querySelector<HTMLElement>("[data-finance-context]");
  const mainPanelVisible =
    mainPanel && window.getComputedStyle(mainPanel).display !== "none";

  if (section === "dashboard") {
    contextPanel?.scrollTo({ top: 0, behavior: "auto" });

    if (mainPanelVisible) {
      mainPanel.scrollTo({ top: 0, behavior: "auto" });
    } else {
      window.scrollTo({ top: 0, behavior: "auto" });
    }

    return;
  }

  const target = document.getElementById(`finance-${section}`);

  if (!target) {
    return;
  }

  if (section === "input") {
    const contextPanel = target.closest<HTMLElement>("[data-finance-context]");

    if (contextPanel) {
      const panelRect = contextPanel.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();

      contextPanel.scrollTo({
        top: Math.max(
          0,
          Math.round(contextPanel.scrollTop + targetRect.top - panelRect.top),
        ),
        behavior: "auto",
      });
      mainPanel?.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
  }

  if (mainPanelVisible && mainPanel.contains(target)) {
    const panelRect = mainPanel.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    mainPanel.scrollTo({
      top: Math.max(
        0,
        Math.round(mainPanel.scrollTop + targetRect.top - panelRect.top),
      ),
      behavior: "auto",
    });
    contextPanel?.scrollTo({ top: 0, behavior: "auto" });
    return;
  }

  const top = window.scrollY + target.getBoundingClientRect().top - 16;

  window.scrollTo({
    top: Math.max(0, Math.round(top)),
    behavior: "auto",
  });
}

export function FinanceDashboard({ initialData }: { initialData: DashboardData }) {
  const defaultAccount =
    initialData.accounts.find((account) => account.kind === "shared") ??
    initialData.accounts[0];
  const personalAccount = initialData.accounts.find(
    (account) =>
      account.kind === "personal" && account.ownerUserId === initialData.currentUserId,
  );
  const [transactions, setTransactions] =
    useState<Transaction[]>(initialData.transactions);
  const [fixedInstances, setFixedInstances] = useState<FixedExpenseInstance[]>(
    initialData.fixedInstances,
  );
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>(
    initialData.recurringExpenses,
  );
  const [balanceSnapshots, setBalanceSnapshots] = useState(
    initialData.balanceSnapshots,
  );
  const [contributionPlans, setContributionPlans] = useState<ContributionPlan[]>(
    initialData.contributionPlans,
  );
  const [categories, setCategories] = useState(initialData.categories);
  const [contributionPlanDrafts, setContributionPlanDrafts] = useState(() =>
    Object.fromEntries(
      initialData.contributionPlans.map((plan) => [
        plan.id,
        {
          amount: String(plan.monthlyAmount || ""),
          depositDay: String(plan.depositDay),
          label: plan.label,
        },
      ]),
    ),
  );
  const [newContributionPlanDrafts, setNewContributionPlanDrafts] = useState(() =>
    Object.fromEntries(
      initialData.householdMembers.map((member) => [
        member.userId,
        {
          label: "",
          amount: "",
          depositDay: "1",
        } satisfies ContributionPlanDraft,
      ]),
    ),
  );
  const [quickCategory, setQuickCategory] = useState(
    preferredVariableCategoryId(
      initialData.categories,
      initialData.transactions,
      initialData.currentUserId,
    ) ??
      initialData.categories[0]?.id ??
      "",
  );
  const [quickAccount, setQuickAccount] = useState(defaultAccount?.id ?? "");
  const [quickPaidById, setQuickPaidById] = useState(
    initialData.currentUserId,
  );
  const [selectedAccountId, setSelectedAccountId] = useState(
    defaultAccount?.id ?? personalAccount?.id ?? "all",
  );
  const [activeSection, setActiveSection] = useState<ActiveSection>("dashboard");
  const [isMobileFixedManagerOpen, setIsMobileFixedManagerOpen] = useState(false);
  const [quickAmount, setQuickAmount] = useState("");
  const [quickDate, setQuickDate] = useState(new Date().toISOString().slice(0, 10));
  const [quickNote, setQuickNote] = useState("");
  const [customCategoryName, setCustomCategoryName] = useState("");
  const [categoryMessage, setCategoryMessage] = useState("");
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [categoryOperationId, setCategoryOperationId] = useState<string | null>(
    null,
  );
  const [contributionAmount, setContributionAmount] = useState("");
  const [contributionDate, setContributionDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [contributionKind, setContributionKind] = useState<ContributionKind>(
    "extra",
  );
  const [contributionPaidById, setContributionPaidById] = useState(
    initialData.currentUserId,
  );
  const [contributionNote, setContributionNote] = useState("");
  const [contributionMessage, setContributionMessage] = useState("");
  const [isSavingContribution, setIsSavingContribution] = useState(false);
  const [balanceAmount, setBalanceAmount] = useState("");
  const [balanceDate, setBalanceDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [balanceMessage, setBalanceMessage] = useState("");
  const [isSavingBalance, setIsSavingBalance] = useState(false);
  const [savingsStartAmount, setSavingsStartAmount] = useState("");
  const [savingsStartDate, setSavingsStartDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [savingsDepositAmount, setSavingsDepositAmount] = useState("");
  const [savingsDepositDate, setSavingsDepositDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [savingsMessage, setSavingsMessage] = useState("");
  const [isSavingSavingsSnapshot, setIsSavingSavingsSnapshot] = useState(false);
  const [isSavingSavingsDeposit, setIsSavingSavingsDeposit] = useState(false);
  const [investmentSettings, setInvestmentSettings] = useState(
    initialData.investmentSettings,
  );
  const [degiroPositions, setDegiroPositions] = useState<DegiroPosition[]>(
    initialData.degiroPositions,
  );
  const [cryptoPositions, setCryptoPositions] = useState<CryptoPosition[]>(
    initialData.cryptoPositions,
  );
  const [degiroName, setDegiroName] = useState("");
  const [degiroTicker, setDegiroTicker] = useState("");
  const [degiroAmount, setDegiroAmount] = useState("");
  const [cryptoCoinName, setCryptoCoinName] = useState("");
  const [cryptoCoinId, setCryptoCoinId] = useState("");
  const [cryptoTicker, setCryptoTicker] = useState("");
  const [cryptoAmount, setCryptoAmount] = useState("");
  const [investmentMessage, setInvestmentMessage] = useState("");
  const [isSavingDegiroPosition, setIsSavingDegiroPosition] = useState(false);
  const [isSavingCryptoPosition, setIsSavingCryptoPosition] = useState(false);
  const [deletingDegiroPositionId, setDeletingDegiroPositionId] = useState<
    string | null
  >(null);
  const [deletingCryptoPositionId, setDeletingCryptoPositionId] = useState<
    string | null
  >(null);
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeDate, setIncomeDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [incomeKind, setIncomeKind] = useState<"salary" | "extra">("salary");
  const [incomeNote, setIncomeNote] = useState("");
  const [incomeMessage, setIncomeMessage] = useState("");
  const [isSavingIncome, setIsSavingIncome] = useState(false);
  const [contributionPlanMessage, setContributionPlanMessage] = useState("");
  const [savingContributionPlanId, setSavingContributionPlanId] = useState<
    string | null
  >(null);
  const [scanMessage, setScanMessage] = useState("");
  const [receiptDraft, setReceiptDraft] = useState<ReceiptDraft | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptViewer, setReceiptViewer] = useState<ReceiptViewerState | null>(
    null,
  );
  const [currentMonth, setCurrentMonth] = useState(initialData.selectedMonth);
  const [loadedMonthKeys, setLoadedMonthKeys] = useState<string[]>([
    initialData.selectedMonth,
  ]);
  const [, setLoadingMonth] = useState<string | null>(null);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isScanningReceipt, setIsScanningReceipt] = useState(false);
  const [monthMessage, setMonthMessage] = useState("");
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(
    null,
  );
  const autoConfirmingFixedInstanceIds = useRef(new Set<string>());
  const autoBookingContributionPlanIds = useRef(new Set<string>());
  const lastForegroundRefreshAt = useRef(0);
  const [skippingFixedInstanceId, setSkippingFixedInstanceId] = useState<
    string | null
  >(null);
  const [editingTransaction, setEditingTransaction] =
    useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editPaidById, setEditPaidById] = useState("");
  const [editContributionKind, setEditContributionKind] =
    useState<ContributionKind>("extra");
  const [editMessage, setEditMessage] = useState("");
  const [isSavingTransactionEdit, setIsSavingTransactionEdit] = useState(false);
  const [fixedMessage, setFixedMessage] = useState("");
  const [manageMessage, setManageMessage] = useState("");
  const [isSavingRecurring, setIsSavingRecurring] = useState(false);
  const [editingRecurringId, setEditingRecurringId] = useState<string | null>(null);
  const [highlightedRecurringId, setHighlightedRecurringId] =
    useState<string | null>(null);
  const [highlightedFixedInstanceId, setHighlightedFixedInstanceId] =
    useState<string | null>(null);
  const [recurringName, setRecurringName] = useState("");
  const [recurringAmount, setRecurringAmount] = useState("");
  const [recurringBillingDay, setRecurringBillingDay] = useState("1");
  const [recurringStartsOn, setRecurringStartsOn] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [recurringCategory, setRecurringCategory] = useState(
    initialData.categories.find(
      (category) => category.kind === "fixed" || category.kind === "both",
    )?.id ??
      initialData.categories[0]?.id ??
      "",
  );
  const [cashflowBuffers, setCashflowBuffers] = useState<Record<string, number>>(
    () =>
      Object.fromEntries(
        initialData.accounts.map((account) => [
          account.id,
          readCashflowBuffer(account.id, account.id === defaultAccount?.id),
        ]),
      ),
  );
  const [chartsReady, setChartsReady] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => setChartsReady(true), 150);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const syncViewport = () => setIsDesktopViewport(window.innerWidth >= 1024);

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  const labels = useMemo(
    () => categoryById(categories),
    [categories],
  );
  const accountsById = useMemo(
    () => new Map(initialData.accounts.map((account) => [account.id, account])),
    [initialData.accounts],
  );
  const accountTabs = useMemo(() => {
    const tabs = [];

    if (defaultAccount) {
      tabs.push({
        id: defaultAccount.id,
        label: "Gezamenlijk",
        description: defaultAccount.name,
      });
    }

    if (personalAccount) {
      tabs.push({
        id: personalAccount.id,
        label: "Mijn rekening",
        description: personalAccount.name,
      });
    }

    return tabs;
  }, [defaultAccount, personalAccount]);
  const selectedAccount = accountsById.get(selectedAccountId);
  const isSharedView = selectedAccount?.kind === "shared";
  const cashflowBuffer = cashflowBuffers[selectedAccountId] ?? 500;

  function updateCashflowBuffer(accountId: string, value: number) {
    const nextValue = Number.isFinite(value) && value >= 0 ? value : 0;

    setCashflowBuffers((buffers) => ({
      ...buffers,
      [accountId]: nextValue,
    }));

    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        cashflowBufferStorageKey(accountId),
        String(nextValue),
      );
    }
  }

  const mobileChartsReady = chartsReady && isDesktopViewport === false;
  const accountBalanceSnapshots = useMemo(
    () => balanceSnapshots.filter((snapshot) => !isSavingsSnapshot(snapshot)),
    [balanceSnapshots],
  );
  const savingsBalanceSnapshots = useMemo(
    () => balanceSnapshots.filter(isSavingsSnapshot),
    [balanceSnapshots],
  );
  const monthOptions = useMemo(
    () =>
      buildMonthOptions(
        transactions,
        fixedInstances,
        accountBalanceSnapshots,
        initialData.selectedMonth,
      ),
    [
      accountBalanceSnapshots,
      fixedInstances,
      initialData.selectedMonth,
      transactions,
    ],
  );
  const loadedMonths = useMemo(
    () => new Set(loadedMonthKeys),
    [loadedMonthKeys],
  );
  const today = new Date().toISOString().slice(0, 10);

  const latestBalanceSnapshot = useMemo(
    () =>
      accountBalanceSnapshots
        .filter((snapshot) => snapshot.accountId === selectedAccountId)
        .filter((snapshot) => snapshot.snapshotDate < monthStart(addIsoMonths(currentMonth, 1)))
        .sort(
          (first, second) =>
            second.snapshotDate.localeCompare(first.snapshotDate),
        )[0],
    [accountBalanceSnapshots, currentMonth, selectedAccountId],
  );
  const cashflowStartSnapshot = latestBalanceSnapshot;
  const showOpeningBalanceReminder =
    today === `${currentMonth}-01` &&
    !accountBalanceSnapshots.some(
      (snapshot) =>
        snapshot.accountId === selectedAccountId &&
        snapshot.snapshotDate === today,
    );
  const viewCopy = isSharedView
    ? {
        label: "Gezamenlijke rekening",
        description:
          "Voor vaste lasten, boodschappen, tanken en alles wat jullie samen betalen.",
        quickTitle: "Gezamenlijke uitgave",
        monthDescription: `${selectedAccount?.name ?? "Gezamenlijke rekening"} in ${monthLabel(currentMonth)}.`,
      }
    : {
        label: "Mijn rekening",
        description:
          "Alleen prive-uitgaven, inkomen en eigen vaste lasten van de ingelogde gebruiker.",
        quickTitle: "Prive-uitgave",
        monthDescription: `${selectedAccount?.name ?? "Mijn rekening"} in ${monthLabel(currentMonth)}.`,
      };

  const selectedTransactions = useMemo(
    () =>
      selectedAccountId === "all"
        ? transactions
        : transactions.filter(
            (transaction) =>
              (transaction.accountId ?? defaultAccount?.id) === selectedAccountId,
          ),
    [defaultAccount?.id, selectedAccountId, transactions],
  );
  const monthTotals = useMemo(
    () => totalsForMonth(selectedTransactions, currentMonth),
    [currentMonth, selectedTransactions],
  );
  const categoryRows = useMemo(
    () => categoryTotals(selectedTransactions, categories, currentMonth),
    [categories, currentMonth, selectedTransactions],
  );
  const personTotals = useMemo(
    () =>
      totalsByPerson(
        selectedTransactions.filter(
          (transaction) => transaction.type === "variable",
        ),
        currentMonth,
      ),
    [currentMonth, selectedTransactions],
  );
  const categoryPersonRows = useMemo(
    () => categoryTotalsByPerson(selectedTransactions, categories, currentMonth),
    [categories, currentMonth, selectedTransactions],
  );
  const categoryUsageCounts = useMemo(
    () => categoryUsageByCurrentUser(transactions, initialData.currentUserId),
    [initialData.currentUserId, transactions],
  );
  const variableCategories = useMemo(
    () => variableCategoryOptions(categories, categoryUsageCounts),
    [categories, categoryUsageCounts],
  );
  const activeQuickCategory = variableCategories.some(
    (category) => category.id === quickCategory,
  )
    ? quickCategory
    : variableCategories[0]?.id ?? "";
  const selectedSixMonthTrend = useMemo(
    () => sixMonthTrend(selectedTransactions, currentMonth),
    [currentMonth, selectedTransactions],
  );
  const monthTransactions = useMemo(
    () =>
      selectedTransactions
        .filter((transaction) => transaction.date.startsWith(currentMonth))
        .sort(
          (first, second) =>
            first.date.localeCompare(second.date) ||
            transactionSortLabel(first, labels).localeCompare(
              transactionSortLabel(second, labels),
              "nl",
            ),
        ),
    [currentMonth, labels, selectedTransactions],
  );
  const selectedRecurringExpenses = useMemo(
    () =>
      recurringExpenses.filter(
        (expense) =>
          (expense.accountId ?? defaultAccount?.id) === selectedAccountId,
      ),
    [defaultAccount?.id, recurringExpenses, selectedAccountId],
  );
  const selectedRecurringExpenseIds = useMemo(
    () => new Set(selectedRecurringExpenses.map((expense) => expense.id)),
    [selectedRecurringExpenses],
  );
  const selectedFixedInstances = useMemo(
    () =>
      fixedInstances.filter((instance) =>
        selectedRecurringExpenseIds.has(instance.recurringExpenseId),
      ),
    [fixedInstances, selectedRecurringExpenseIds],
  );
  const openFixedTotalForCurrentMonth = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const currentMonthInstances = new Map(
      selectedFixedInstances
        .filter((instance) => instance.month === currentMonth)
        .map((instance) => [instance.recurringExpenseId, instance]),
    );

    return selectedRecurringExpenses.reduce((total, expense) => {
      const instance = currentMonthInstances.get(expense.id);
      const billingDate = dateForBillingDay(currentMonth, expense.billingDay);

      if (instance?.status !== "pending" || billingDate < today) {
        return total;
      }

      return total + instance.amount;
    }, 0);
  }, [currentMonth, selectedFixedInstances, selectedRecurringExpenses]);
  const sharedContributionPlans = useMemo(
    () =>
      contributionPlans.filter(
        (plan) => plan.isActive && plan.accountId === defaultAccount?.id,
      ),
    [contributionPlans, defaultAccount?.id],
  );
  const plannedContributionReceivedByUser = useMemo(() => {
    const totals = new Map<string, number>();

    transactions
      .filter(
        (transaction) =>
          transaction.type === "contribution" &&
          transaction.contributionKind === "planned" &&
          transaction.date.startsWith(currentMonth) &&
          (transaction.accountId ?? defaultAccount?.id) === defaultAccount?.id,
      )
      .forEach((transaction) => {
        const key = transaction.paidById ?? transaction.enteredById ?? transaction.enteredBy;
        totals.set(key, (totals.get(key) ?? 0) + transaction.amount);
      });

    return totals;
  }, [currentMonth, defaultAccount?.id, transactions]);
  const extraContributionTotal = useMemo(
    () =>
      transactions
        .filter(
          (transaction) =>
            transaction.type === "contribution" &&
            transaction.contributionKind === "extra" &&
            transaction.date.startsWith(currentMonth) &&
            (transaction.accountId ?? defaultAccount?.id) === defaultAccount?.id,
        )
        .reduce((total, transaction) => total + transaction.amount, 0),
    [currentMonth, defaultAccount?.id, transactions],
  );
  const taxReturnContributionTotal = useMemo(
    () =>
      transactions
        .filter(
          (transaction) =>
            transaction.type === "contribution" &&
            transaction.contributionKind === "belastingteruggave" &&
            transaction.date.startsWith(currentMonth) &&
            (transaction.accountId ?? defaultAccount?.id) === defaultAccount?.id,
        )
        .reduce((total, transaction) => total + transaction.amount, 0),
    [currentMonth, defaultAccount?.id, transactions],
  );
  const selectedExtraContributionTotal = useMemo(
    () =>
      selectedTransactions
        .filter(
          (transaction) =>
            transaction.type === "contribution" &&
            transaction.contributionKind === "extra" &&
            transaction.date.startsWith(currentMonth),
        )
        .reduce((total, transaction) => total + transaction.amount, 0),
    [currentMonth, selectedTransactions],
  );
  const selectedTaxReturnContributionTotal = useMemo(
    () =>
      selectedTransactions
        .filter(
          (transaction) =>
            transaction.type === "contribution" &&
            transaction.contributionKind === "belastingteruggave" &&
            transaction.date.startsWith(currentMonth),
        )
        .reduce((total, transaction) => total + transaction.amount, 0),
    [currentMonth, selectedTransactions],
  );
  const contributionBreakdown = useMemo(
    () =>
      buildContributionBreakdown({
        transactions,
        plans: sharedContributionPlans,
        householdMembers: initialData.householdMembers,
        currentMonth,
        sharedAccountId: defaultAccount?.id,
      }),
    [
      currentMonth,
      defaultAccount?.id,
      initialData.householdMembers,
      sharedContributionPlans,
      transactions,
    ],
  );
  const contributionPlanRows = useMemo(
    () =>
      buildContributionPlanRows(
        sharedContributionPlans,
        plannedContributionReceivedByUser,
      ),
    [plannedContributionReceivedByUser, sharedContributionPlans],
  );
  const plannedContributionTotal = contributionPlanRows.reduce(
    (total, plan) => total + plan.monthlyAmount,
    0,
  );
  const remainingContributionTotal = contributionPlanRows.reduce(
    (total, plan) => total + plan.remaining,
    0,
  );
  const calculatedBalance = latestBalanceSnapshot
    ? latestBalanceSnapshot.balance +
      selectedTransactions
        .filter((transaction) => transaction.date >= latestBalanceSnapshot.snapshotDate)
        .filter((transaction) => transaction.date <= today)
        .filter((transaction) => transaction.date < monthStart(addIsoMonths(currentMonth, 1)))
        .reduce((total, transaction) => total + signedTransactionAmount(transaction), 0)
    : null;
  const fixedAgendaItems = useMemo(
    () =>
      buildFixedAgendaItems(
        selectedRecurringExpenses,
        selectedFixedInstances,
        currentMonth,
        labels,
      ),
    [currentMonth, labels, selectedFixedInstances, selectedRecurringExpenses],
  );
  useEffect(() => {
    if (!latestBalanceSnapshot) {
      console.log("[finance:balance-diagnose]", {
        accountId: selectedAccountId,
        accountName: selectedAccount?.name,
        month: currentMonth,
        today,
        formula: "geen snapshot beschikbaar, dus huidig saldo is null",
      });
      return;
    }

    const includedTransactions = selectedTransactions
      .filter((transaction) => transaction.date >= latestBalanceSnapshot.snapshotDate)
      .filter((transaction) => transaction.date <= today)
      .filter((transaction) => transaction.date < monthStart(addIsoMonths(currentMonth, 1)))
      .map((transaction) => ({
        id: transaction.id,
        date: transaction.date,
        type: transaction.type,
        amount: transaction.amount,
        signedAmount: signedTransactionAmount(transaction),
        note: transaction.note,
      }));
    const transactionDelta = includedTransactions.reduce(
      (total, transaction) => total + transaction.signedAmount,
      0,
    );

    console.log("[finance:balance-diagnose]", {
      accountId: selectedAccountId,
      accountName: selectedAccount?.name,
      month: currentMonth,
      today,
      snapshot: {
        id: latestBalanceSnapshot.id,
        value: latestBalanceSnapshot.balance,
        date: latestBalanceSnapshot.snapshotDate,
      },
      formula:
        "huidig saldo = snapshot + som(income/contribution positief, fixed/variable negatief) voor transacties vanaf snapshotdatum t/m vandaag en voor einde geselecteerde maand",
      includedTransactions,
      fixedTransactionsIncluded: includedTransactions.filter(
        (transaction) => transaction.type === "fixed",
      ),
      fixedAgendaStates: fixedAgendaItems.map((item) => ({
        id: item.id,
        name: item.name,
        date: item.date,
        amount: item.amount,
        state: item.state,
      })),
      transactionDelta,
      calculatedBalance,
    });
  }, [
    calculatedBalance,
    currentMonth,
    fixedAgendaItems,
    latestBalanceSnapshot,
    selectedAccount?.name,
    selectedAccountId,
    selectedTransactions,
    today,
  ]);
  useEffect(() => {
    void autoConfirmDueFixedExpenses(currentMonth);
  }, [currentMonth, fixedInstances, recurringExpenses, today]);
  useEffect(() => {
    if (!defaultAccount || !isSharedView) {
      return;
    }

    contributionPlanRows
      .filter((plan) => plan.remaining > 0)
      .filter((plan) => dateForBillingDay(currentMonth, plan.depositDay) <= today)
      .filter((plan) => !autoBookingContributionPlanIds.current.has(plan.id))
      .forEach((plan) => {
        autoBookingContributionPlanIds.current.add(plan.id);
        void bookExpectedContributionPlan(plan, { automatic: true });
      });
  }, [contributionPlanRows, currentMonth, defaultAccount, isSharedView, today]);
  const outgoingTransactionRows = useMemo(
    () =>
      buildOutgoingTransactionRows(
        monthTransactions,
        fixedAgendaItems,
        labels,
        today,
      ),
    [
      fixedAgendaItems,
      labels,
      monthTransactions,
      today,
    ],
  );
  const fixedTotalForCurrentMonth = useMemo(
    () =>
      expectedFixedTotalForMonth(
        selectedRecurringExpenses,
        selectedFixedInstances,
        currentMonth,
      ),
    [currentMonth, selectedFixedInstances, selectedRecurringExpenses],
  );
  const variableExpenseTotalToDate = useMemo(
    () =>
      selectedTransactions
        .filter((transaction) => transaction.type === "variable")
        .filter((transaction) => transaction.date.startsWith(currentMonth))
        .filter((transaction) => transaction.date <= today)
        .reduce((total, transaction) => total + transaction.amount, 0),
    [currentMonth, selectedTransactions, today],
  );
  const variableSpendPacing = useMemo(
    () =>
      buildVariableSpendPacing({
        transactions: selectedTransactions,
        month: currentMonth,
        today,
      }),
    [currentMonth, selectedTransactions, today],
  );
  const incomeTotalToDate = useMemo(
    () =>
      selectedTransactions
        .filter((transaction) => transaction.type === "income")
        .filter((transaction) => transaction.date.startsWith(currentMonth))
        .filter((transaction) => transaction.date <= today)
        .reduce((total, transaction) => total + transaction.amount, 0),
    [currentMonth, selectedTransactions, today],
  );
  const expectedIncomeTotalForMonth = useMemo(
    () =>
      selectedTransactions
        .filter((transaction) => transaction.type === "income")
        .filter((transaction) => transaction.date.startsWith(currentMonth))
        .reduce((total, transaction) => total + transaction.amount, 0),
    [currentMonth, selectedTransactions],
  );
  const incomeTransactionsForCurrentMonth = useMemo(
    () =>
      selectedTransactions
        .filter((transaction) => transaction.type === "income")
        .filter((transaction) => transaction.date.startsWith(currentMonth))
        .sort(
          (first, second) =>
            second.date.localeCompare(first.date) ||
            transactionSortLabel(first, labels).localeCompare(
              transactionSortLabel(second, labels),
              "nl",
            ),
        ),
    [currentMonth, labels, selectedTransactions],
  );
  const heroBudget = useMemo(
    () =>
      buildHeroBudgetSnapshot({
        incomingTotal: isSharedView
          ? plannedContributionTotal + extraContributionTotal
          : expectedIncomeTotalForMonth,
        postedIncomingTotal: isSharedView
          ? monthTotals.contributionTotal
          : incomeTotalToDate,
        plannedIncomingTotal: isSharedView
          ? plannedContributionTotal
          : expectedIncomeTotalForMonth,
        expectedFixedTotal: fixedTotalForCurrentMonth,
        variableExpenseTotal: variableExpenseTotalToDate,
      }),
    [
      expectedIncomeTotalForMonth,
      fixedTotalForCurrentMonth,
      extraContributionTotal,
      incomeTotalToDate,
      isSharedView,
      monthTotals.contributionTotal,
      plannedContributionTotal,
      variableExpenseTotalToDate,
    ],
  );
  const latestSavingsSnapshot = useMemo(
    () =>
      savingsBalanceSnapshots
        .filter((snapshot) => snapshot.accountId === selectedAccountId)
        .filter((snapshot) => snapshot.snapshotDate <= today)
        .sort(
          (first, second) =>
            second.snapshotDate.localeCompare(first.snapshotDate),
        )[0],
    [savingsBalanceSnapshots, selectedAccountId, today],
  );
  const savingsTransactionsToDate = useMemo(
    () =>
      selectedTransactions
        .filter((transaction) => transaction.type === "sparen")
        .filter((transaction) => transaction.date <= today)
        .sort((first, second) => second.date.localeCompare(first.date)),
    [selectedTransactions, today],
  );
  const savingsDepositTotalToDate = savingsTransactionsToDate.reduce(
    (total, transaction) => total + transaction.amount,
    0,
  );
  const currentSavingsBalance = latestSavingsSnapshot
    ? latestSavingsSnapshot.balance + savingsDepositTotalToDate
    : null;
  const savingsSuggestionAmount =
    heroBudget.remainingFreeBudget > 0 ? heroBudget.remainingFreeBudget : 0;
  const showInvestmentSection =
    !isSharedView && investmentSettings.investingEnabled;
  const showPdtNavLink =
    showInvestmentSection &&
    initialData.currentUserEmail === "ralph.wijnands1988@gmail.com";
  const displayedExpenseTotal = monthTotals.expenseTotal;
  const displayedNetTotal =
    monthTotals.contributionTotal + monthTotals.incomeTotal - displayedExpenseTotal;
  const contributionCoverage = useMemo(
    () =>
      buildContributionCoverage({
        transactions: selectedTransactions,
        month: currentMonth,
        plannedContributionTotal,
        fixedTotal: fixedTotalForCurrentMonth,
        buffer: cashflowBuffer,
      }),
    [
      cashflowBuffer,
      currentMonth,
      fixedTotalForCurrentMonth,
      plannedContributionTotal,
      selectedTransactions,
    ],
  );
  const ownMonthlyContributionTotal = contributionPlanRows
    .filter((plan) => plan.userId === initialData.currentUserId)
    .reduce((total, plan) => total + plan.monthlyAmount, 0);
  const personalContributionCoverage = useMemo(
    () =>
      buildPersonalContributionCoverage({
        transactions: selectedTransactions,
        month: currentMonth,
        incomeTotal: incomeTotalToDate,
        ownMonthlyContributionTotal,
        buffer: cashflowBuffer,
      }),
    [
      cashflowBuffer,
      currentMonth,
      incomeTotalToDate,
      ownMonthlyContributionTotal,
      selectedTransactions,
    ],
  );
  const cashflowEvents = useMemo(() => {
    const futureFixedEvents = fixedAgendaItems
      .filter((item) => item.canSkip && item.date > today)
      .map((item) => ({
        date: item.date,
        day: item.day,
        amount: -item.amount,
      }));
    const futureSavingsEvents = selectedTransactions
      .filter((transaction) => transaction.type === "sparen")
      .filter((transaction) => transaction.date.startsWith(currentMonth))
      .filter((transaction) => transaction.date > today)
      .map((transaction) => ({
        date: transaction.date,
        day: Number(transaction.date.slice(8, 10)),
        amount: -transaction.amount,
      }));

    if (isSharedView) {
      return [
        ...futureFixedEvents,
        ...futureSavingsEvents,
        ...contributionPlanRows
          .filter((plan) => plan.remaining > 0)
          .map((plan) => {
            const date = dateForBillingDay(currentMonth, plan.depositDay);

            return {
              date,
              day: Number(date.slice(8, 10)),
              amount: plan.remaining,
            };
          }),
      ] satisfies CashflowEvent[];
    }

    const ownContributionPlanEvents = contributionPlanRows
      .filter((plan) => plan.userId === initialData.currentUserId)
      .filter((plan) => plan.remaining > 0)
      .map((plan) => {
        const date = dateForBillingDay(currentMonth, plan.depositDay);

        return {
          date,
          day: Number(date.slice(8, 10)),
          amount: -plan.remaining,
        };
      });
    const incomeEvents = selectedTransactions
      .filter((transaction) => transaction.type === "income")
      .filter((transaction) => transaction.date.startsWith(currentMonth))
      .filter((transaction) => transaction.date > today)
      .map((transaction) => ({
        date: transaction.date,
        day: Number(transaction.date.slice(8, 10)),
        amount: transaction.amount,
      }));

    return [
      ...futureFixedEvents,
      ...futureSavingsEvents,
      ...ownContributionPlanEvents,
      ...incomeEvents,
    ] satisfies CashflowEvent[];
  }, [
    contributionPlanRows,
    currentMonth,
    fixedAgendaItems,
    initialData.currentUserId,
    isSharedView,
    selectedTransactions,
    today,
  ]);
  const cashflowTimeline = useMemo(
    () =>
      buildCashflowTimeline({
        startSnapshot: cashflowStartSnapshot,
        currentBalance: calculatedBalance,
        month: currentMonth,
        transactions: selectedTransactions,
        events: cashflowEvents,
      }),
    [
      calculatedBalance,
      cashflowEvents,
      cashflowStartSnapshot,
      currentMonth,
      selectedTransactions,
    ],
  );

  async function autoConfirmDueFixedExpenses(month: string) {
    const recurringById = new Map(
      recurringExpenses.map((expense) => [expense.id, expense]),
    );
    const dueInstances = fixedInstances.filter((instance) => {
      if (instance.month !== month || instance.status !== "pending") {
        return false;
      }

      const recurringExpense = recurringById.get(instance.recurringExpenseId);

      if (!recurringExpense?.isActive) {
        return false;
      }

      const billingDate = dateForBillingDay(month, recurringExpense.billingDay);

      return (
        billingDate <= today &&
        !autoConfirmingFixedInstanceIds.current.has(instance.id)
      );
    });

    if (dueInstances.length === 0) {
      return;
    }

    dueInstances.forEach((instance) =>
      autoConfirmingFixedInstanceIds.current.add(instance.id),
    );

    const results = await Promise.allSettled(
      dueInstances.map(async (instance) => {
        const response = await fetch("/api/fixed-expenses/confirm", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            instanceId: instance.id,
            action: "confirm",
          }),
        });
        const result = await response.json();

        if (response.status === 409) {
          return {
            fixedInstance: null,
            shouldRefreshMonthData: true,
          };
        }

        if (!response.ok) {
          throw new Error(
            typeof result.error === "string"
              ? result.error
              : "Vaste last automatisch verwerken lukte niet.",
          );
        }

        return {
          fixedInstance: result.fixedInstance as FixedExpenseInstance | null,
          shouldRefreshMonthData: true,
        };
      }),
    );

    dueInstances.forEach((instance) =>
      autoConfirmingFixedInstanceIds.current.delete(instance.id),
    );

    const confirmedInstances = results.flatMap((result) =>
      result.status === "fulfilled" && result.value.fixedInstance
        ? [result.value.fixedInstance]
        : [],
    );
    const shouldRefreshMonthData = results.some(
      (result) =>
        result.status === "fulfilled" && result.value.shouldRefreshMonthData,
    );

    if (confirmedInstances.length > 0) {
      setFixedInstances((items) =>
        mergeById(items, confirmedInstances).sort((first, second) =>
          first.name.localeCompare(second.name, "nl"),
        ),
      );
    }

    if (!shouldRefreshMonthData) {
      return;
    }

    const [transactionsResponse, recurringResponse] = await Promise.all([
      fetch(`/api/transactions?month=${encodeURIComponent(month)}`),
      fetch(`/api/recurring-expenses?month=${encodeURIComponent(month)}`),
    ]);
    const transactionsResult =
      (await transactionsResponse.json()) as MonthDataResponse;
    const recurringResult =
      (await recurringResponse.json()) as MonthDataResponse;

    if (transactionsResponse.ok) {
      setTransactions((items) =>
        mergeById(items, transactionsResult.transactions ?? []).sort((a, b) =>
          b.date.localeCompare(a.date),
        ),
      );
    }

    if (recurringResponse.ok) {
      setRecurringExpenses((items) =>
        mergeById(items, recurringResult.recurringExpenses ?? []).sort((a, b) =>
          a.name.localeCompare(b.name, "nl"),
        ),
      );
      setFixedInstances((items) =>
        mergeById(items, recurringResult.fixedInstances ?? []).sort((a, b) =>
          a.name.localeCompare(b.name, "nl"),
        ),
      );
    }
  }

  async function skipFixedExpense(item: FixedAgendaItem) {
    if (!item.canSkip || skippingFixedInstanceId) return;

    const confirmed = window.confirm(
      `${item.name} overslaan voor ${monthLabel(currentMonth)}?`,
    );

    if (!confirmed) return;

    setSkippingFixedInstanceId(item.id);
    setFixedMessage("");

    const response = await fetch("/api/fixed-expenses/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instanceId: item.id,
        action: "skip",
      }),
    });
    const result = await response.json();

    setSkippingFixedInstanceId(null);

    if (!response.ok) {
      setFixedMessage(
        typeof result.error === "string"
          ? result.error
          : "Vaste last overslaan lukte niet.",
      );
      return;
    }

    if (result.fixedInstance) {
      const fixedInstance = result.fixedInstance as FixedExpenseInstance;
      setFixedInstances((items) =>
        mergeById(items, [fixedInstance]).sort((first, second) =>
          first.name.localeCompare(second.name, "nl"),
        ),
      );
      setHighlightedFixedInstanceId(fixedInstance.id);
    }

    setFixedMessage(`${item.name} is overgeslagen.`);
  }

  const dashboardPrimaryValue =
    calculatedBalance === null
      ? isSharedView
        ? currency(displayedNetTotal)
        : "Geen saldo"
      : currency(calculatedBalance);
  const dashboardPrimarySubtext =
    calculatedBalance === null && isSharedView
      ? "Deze maand tot nu toe"
      : "Huidig saldo";
  const dashboardMetrics: DashboardMetric[] = isSharedView
    ? [
        {
          icon: <ReceiptText className="h-5 w-5" />,
          label: "Uitgaven",
          value: currency(heroBudget.variableExpenseTotal),
          detail: `van ${currency(heroBudget.freeBudget)} vrij budget`,
          tone: "zinc" as const,
          progress: heroBudget.expenseProgress,
          progressTone: heroBudget.expenseProgressTone,
        },
        {
          icon: <WalletCards className="h-5 w-5" />,
          label: "Vrije ruimte",
          value: currency(heroBudget.remainingFreeBudget),
          detail: `van ${currency(heroBudget.freeBudget)} deze maand`,
          tone: heroBudget.remainingFreeBudget < 0 ? "red" : "emerald",
          valueTone: heroBudget.remainingFreeBudget < 0 ? "red" : "default",
          progress: heroBudget.expenseProgress,
          progressTone: heroBudget.expenseProgressTone,
        },
        {
          icon: <ArrowDownToLine className="h-5 w-5" />,
          label: "Stortingen",
          value: currency(heroBudget.postedIncomingTotal),
          detail:
            heroBudget.plannedIncomingTotal > 0
              ? `verwacht ${currency(heroBudget.plannedIncomingTotal)}`
              : undefined,
          tone: "emerald" as const,
          progress: heroBudget.depositProgress,
          progressTone: heroBudget.depositProgressTone,
        },
      ]
    : [
        {
          icon: <ReceiptText className="h-5 w-5" />,
          label: "Uitgaven",
          value: currency(heroBudget.variableExpenseTotal),
          detail: `van ${currency(heroBudget.freeBudget)} vrij budget`,
          tone: "zinc" as const,
          progress: heroBudget.expenseProgress,
          progressTone: heroBudget.expenseProgressTone,
        },
        {
          icon: <WalletCards className="h-5 w-5" />,
          label: "Vrije ruimte",
          value: currency(heroBudget.remainingFreeBudget),
          detail: `van ${currency(heroBudget.freeBudget)} deze maand`,
          tone: heroBudget.remainingFreeBudget < 0 ? "red" : "indigo",
          valueTone: heroBudget.remainingFreeBudget < 0 ? "red" : "default",
          progress: heroBudget.expenseProgress,
          progressTone: heroBudget.expenseProgressTone,
        },
        {
          icon: <ArrowDownToLine className="h-5 w-5" />,
          label: "Inkomen",
          value: currency(heroBudget.postedIncomingTotal),
          detail:
            heroBudget.plannedIncomingTotal > 0
              ? `verwacht ${currency(heroBudget.plannedIncomingTotal)}`
              : undefined,
          tone: "emerald" as const,
          progress: heroBudget.depositProgress,
          progressTone: heroBudget.depositProgressTone,
        },
      ];
  const fixedCategories = useMemo(
    () => {
      const items = categories
        .filter((category) => category.kind === "fixed" || category.kind === "both")
        .filter(
          (category) =>
            !isSharedView ||
            category.name.toLocaleLowerCase("nl-NL") !==
              JOINT_CONTRIBUTION_FIXED_CATEGORY_NAME.toLocaleLowerCase("nl-NL"),
        );
      const hasJointContributionCategory = items.some(
        (category) =>
          category.name.toLocaleLowerCase("nl-NL") ===
          JOINT_CONTRIBUTION_FIXED_CATEGORY_NAME.toLocaleLowerCase("nl-NL"),
      );

      if (isSharedView || hasJointContributionCategory) {
        return items;
      }

      return [
        ...items,
        {
          id: JOINT_CONTRIBUTION_FIXED_CATEGORY_ID,
          name: JOINT_CONTRIBUTION_FIXED_CATEGORY_NAME,
          kind: "fixed",
          color: "#6366F1",
          averageMonthly: 0,
          sortOrder: 999,
        } satisfies DashboardData["categories"][number],
      ];
    },
    [categories, isSharedView],
  );

  async function loadMonthData(
    month: string,
    options: { force?: boolean } = {},
  ) {
    if (!options.force && loadedMonths.has(month)) {
      return;
    }

    setLoadingMonth(month);

    try {
      const [transactionsResponse, recurringResponse] = await Promise.all([
        fetch(`/api/transactions?month=${encodeURIComponent(month)}`),
        fetch(`/api/recurring-expenses?month=${encodeURIComponent(month)}`),
      ]);
      const transactionsResult =
        (await transactionsResponse.json()) as MonthDataResponse;
      const recurringResult =
        (await recurringResponse.json()) as MonthDataResponse;

      if (!transactionsResponse.ok || !recurringResponse.ok) {
        throw new Error(
          transactionsResult.error ??
            recurringResult.error ??
            "Maandgegevens konden niet worden geladen.",
        );
      }

      const nextTransactions = transactionsResult.transactions ?? [];
      const nextRecurringExpenses = recurringResult.recurringExpenses ?? [];
      const nextFixedInstances = recurringResult.fixedInstances ?? [];

      setTransactions((items) => {
        const mergedItems = options.force
          ? [
              ...items.filter(
                (item) =>
                  item.date < monthStart(addIsoMonths(month, -5)) ||
                  item.date >= monthStart(addIsoMonths(month, 1)),
              ),
              ...nextTransactions,
            ]
          : mergeById(items, nextTransactions);

        return mergedItems.sort((a, b) => b.date.localeCompare(a.date));
      });
      setRecurringExpenses((items) => {
        const mergedItems = options.force
          ? nextRecurringExpenses
          : mergeById(items, nextRecurringExpenses);

        return mergedItems.sort((a, b) => a.name.localeCompare(b.name, "nl"));
      });
      setFixedInstances((items) => {
        const mergedItems = options.force
          ? [
              ...items.filter((item) => item.month !== monthStart(month)),
              ...nextFixedInstances,
            ]
          : mergeById(items, nextFixedInstances);

        return mergedItems.sort((a, b) => a.name.localeCompare(b.name, "nl"));
      });
      setLoadedMonthKeys((keys) =>
        keys.includes(month) ? keys : [...keys, month],
      );
    } catch {
      setMonthMessage(
        `Gegevens voor ${monthLabel(month)} konden niet worden geladen.`,
      );
    } finally {
      setLoadingMonth(null);
    }
  }

  function changeCurrentMonth(month: string) {
    setCurrentMonth(month);
    setMonthMessage("");
    void loadMonthData(month);
  }

  useEffect(() => {
    const refreshCurrentMonth = () => {
      if (document.visibilityState === "hidden") {
        return;
      }

      const now = Date.now();

      if (now - lastForegroundRefreshAt.current < 2000) {
        return;
      }

      lastForegroundRefreshAt.current = now;
      void loadMonthData(currentMonth, { force: true });
    };

    window.addEventListener("focus", refreshCurrentMonth);
    document.addEventListener("visibilitychange", refreshCurrentMonth);
    window.addEventListener("pageshow", refreshCurrentMonth);

    return () => {
      window.removeEventListener("focus", refreshCurrentMonth);
      document.removeEventListener("visibilitychange", refreshCurrentMonth);
      window.removeEventListener("pageshow", refreshCurrentMonth);
    };
  }, [currentMonth]);

  async function addVariableExpense() {
    const amount = parseCurrencyInput(quickAmount);
    const selectedAccount = accountsById.get(quickAccount) ?? defaultAccount;
    const paidByMember =
      initialData.householdMembers.find((member) => member.userId === quickPaidById) ??
      initialData.householdMembers.find(
        (member) => member.userId === initialData.currentUserId,
      );

    if (!amount || amount <= 0) {
      setScanMessage("Vul een geldig bedrag in.");
      return;
    }

    if (!activeQuickCategory) {
      setScanMessage("Kies een categorie.");
      return;
    }

    if (!selectedAccount) {
      setScanMessage("Kies een rekening.");
      return;
    }

    const response = await fetch("/api/transactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        householdId: initialData.householdId,
        accountId: selectedAccount.id,
        categoryId: activeQuickCategory,
        amount,
        date: quickDate,
        note: quickNote || null,
        paidById: paidByMember?.userId ?? initialData.currentUserId,
      }),
    });
    const result = await response.json();

    if (!response.ok) {
      setScanMessage(
        typeof result.error === "string"
          ? result.error
          : "Opslaan lukte niet. Probeer het nog eens.",
      );
      return;
    }

    const transaction: Transaction = {
      id: result.transaction.id,
      type: "variable",
      accountId: result.transaction.accountId ?? selectedAccount.id,
      accountName: selectedAccount.name,
      accountKind: selectedAccount.kind,
      categoryId: activeQuickCategory,
      amount,
      date: quickDate,
      note: quickNote || undefined,
      enteredById: initialData.currentUserId,
      enteredBy: initialData.currentPerson,
      paidById:
        result.transaction.paidById ??
        paidByMember?.userId ??
        initialData.currentUserId,
      paidBy: paidByMember?.displayName ?? initialData.currentPerson,
    };

    setTransactions((items) => [transaction, ...items]);

    let receiptUrl: string | null = null;
    if (receiptFile) {
      setScanMessage("Uitgave toegevoegd. Bon wordt opgeslagen...");

      try {
        receiptUrl = await saveReceiptForTransaction({
          file: receiptFile,
          accountId: selectedAccount.id,
          transactionId: transaction.id,
        });
        setTransactions((items) =>
          items.map((item) =>
            item.id === transaction.id
              ? { ...item, receiptUrl: receiptUrl ?? undefined }
              : item,
          ),
        );
      } catch {
        setScanMessage(
          "Uitgave toegevoegd, maar bon opslaan lukte niet. Je kunt verder werken.",
        );
      }
    }

    setSelectedAccountId(selectedAccount.id);
    setQuickAmount("");
    setQuickNote("");
    if (!receiptFile || receiptUrl) {
      setScanMessage(
        receiptUrl ? "Uitgave en bon opgeslagen." : "Uitgave toegevoegd.",
      );
    }
    setReceiptDraft(null);
    setReceiptFile(null);
  }

  async function addContribution() {
    const amount = parseCurrencyInput(contributionAmount);
    const targetAccount = isSharedView ? defaultAccount : selectedAccount;
    const contributionMember =
      initialData.householdMembers.find(
        (member) => member.userId === contributionPaidById,
      ) ??
      initialData.householdMembers.find(
        (member) => member.userId === initialData.currentUserId,
      );

    if (!amount || amount <= 0 || !targetAccount || !contributionMember) {
      setContributionMessage("Vul een geldig bedrag in.");
      return false;
    }

    setIsSavingContribution(true);
    setContributionMessage("");

    const response = await fetch("/api/transactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        householdId: initialData.householdId,
        accountId: targetAccount.id,
        amount,
        date: contributionDate,
        note: contributionNote || defaultContributionNote(contributionKind),
        type: "contribution",
        contributionKind,
        paidById: contributionMember.userId,
      }),
    });
    const result = await response.json();

    setIsSavingContribution(false);

    if (!response.ok) {
      setContributionMessage(
        typeof result.error === "string"
          ? result.error
          : "Storting opslaan lukte niet. Probeer het nog eens.",
      );
      return false;
    }

    const contributionCategory =
      categories.find((category) =>
        ["Inleg", "Stortingen"].includes(category.name),
      ) ??
      ({
        id: result.transaction.categoryId,
        name: "Stortingen",
        kind: "variable",
        color: "#34D399",
        averageMonthly: 0,
      } satisfies DashboardData["categories"][number]);

    setTransactions((items) => [
      {
        id: result.transaction.id,
        type: "contribution",
        contributionKind,
        accountId: targetAccount.id,
        accountName: targetAccount.name,
        accountKind: targetAccount.kind,
        categoryId: contributionCategory.id,
        amount,
        date: contributionDate,
        note: contributionNote || defaultContributionNote(contributionKind),
        enteredById: initialData.currentUserId,
        enteredBy: initialData.currentPerson,
        paidById: result.transaction.paidById ?? contributionMember.userId,
        paidBy: contributionMember.displayName,
      },
      ...items,
    ]);
    setContributionAmount("");
    setContributionNote("");
    setContributionMessage("Storting toegevoegd.");
    setSelectedAccountId(targetAccount.id);
    setQuickAccount(targetAccount.id);
    return true;
  }

  async function bookExpectedContributionPlan(
    plan: ContributionPlanRow,
    options: { automatic?: boolean } = {},
  ) {
    const isAutomatic = options.automatic === true;

    if (!defaultAccount || plan.remaining <= 0) {
      if (!isAutomatic) {
        setMonthMessage("Deze verwachte storting kan niet geboekt worden.");
      }
      autoBookingContributionPlanIds.current.delete(plan.id);
      return;
    }

    const transactionDate = dateForBillingDay(currentMonth, plan.depositDay);
    const note = plan.label || "Geplande storting";

    if (!isAutomatic) {
      setMonthMessage("");
    }

    const response = await fetch("/api/transactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        householdId: initialData.householdId,
        accountId: defaultAccount.id,
        amount: plan.remaining,
        date: transactionDate,
        note,
        type: "contribution",
        contributionKind: "planned",
        paidById: plan.userId,
      }),
    });
    const result = await response.json();

    autoBookingContributionPlanIds.current.delete(plan.id);

    if (!response.ok) {
      if (!isAutomatic) {
        setMonthMessage(
          typeof result.error === "string"
            ? result.error
            : "Storting verwerken lukte niet. Probeer het nog eens.",
        );
      }
      return;
    }

    const contributionCategory =
      categories.find((category) =>
        ["Inleg", "Stortingen"].includes(category.name),
      ) ??
      ({
        id: result.transaction.categoryId,
        name: "Stortingen",
        kind: "variable",
        color: "#34D399",
        averageMonthly: 0,
      } satisfies DashboardData["categories"][number]);

    const plannedTransaction = {
        id: result.transaction.id,
        type: "contribution",
        contributionKind: "planned",
        accountId: defaultAccount.id,
        accountName: defaultAccount.name,
        accountKind: defaultAccount.kind,
        categoryId: contributionCategory.id,
        amount: plan.remaining,
        date: transactionDate,
        note,
        enteredById: initialData.currentUserId,
        enteredBy: initialData.currentPerson,
        paidById: result.transaction.paidById ?? plan.userId,
        paidBy: plan.person,
      } satisfies Transaction;

    setTransactions((items) =>
      mergeById(items, [plannedTransaction]).sort((first, second) =>
        second.date.localeCompare(first.date),
      ),
    );

    if (!isAutomatic) {
      setSelectedAccountId(defaultAccount.id);
      setQuickAccount(defaultAccount.id);
      setMonthMessage(`${plan.label || "Storting"} geboekt.`);
    }
  }

  async function saveBalanceSnapshot() {
    const amount = parseCurrencyInput(balanceAmount);

    if (!selectedAccount || Number.isNaN(amount)) {
      setBalanceMessage("Vul een geldig saldo in.");
      return;
    }

    setIsSavingBalance(true);
    setBalanceMessage("");

    const response = await fetch("/api/account-balance-snapshots", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        householdId: initialData.householdId,
        accountId: selectedAccount.id,
        balance: amount,
        snapshotDate: balanceDate,
        note: "Saldo aangepast",
      }),
    });
    const result = await response.json();

    setIsSavingBalance(false);

    if (!response.ok) {
      setBalanceMessage(
        typeof result.error === "string"
          ? result.error
          : "Saldo opslaan lukte niet.",
      );
      return;
    }

    setBalanceSnapshots((items) => [result.snapshot, ...items]);
    setBalanceAmount("");
    setBalanceMessage("Saldo bijgewerkt.");
  }

  async function deleteBalanceSnapshot(snapshot: AccountBalanceSnapshot) {
    const confirmed = window.confirm(
      "Saldo-invoer verwijderen?\n\nJe kunt daarna gewoon een nieuw saldo invoeren.",
    );

    if (!confirmed) return;

    setIsSavingBalance(true);
    setBalanceMessage("");

    const response = await fetch("/api/account-balance-snapshots", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        householdId: initialData.householdId,
        snapshotId: snapshot.id,
      }),
    });
    const result = await response.json();

    setIsSavingBalance(false);

    if (!response.ok) {
      setBalanceMessage(
        typeof result.error === "string"
          ? result.error
          : "Saldo verwijderen lukte niet.",
      );
      return;
    }

    setBalanceSnapshots((items) =>
      items.filter((item) => item.id !== snapshot.id),
    );
    setBalanceMessage("Saldo verwijderd. Je kunt nu een nieuw saldo invoeren.");
  }

  async function saveSavingsSnapshot() {
    const amount = parseCurrencyInput(savingsStartAmount);

    if (!selectedAccount || Number.isNaN(amount)) {
      setSavingsMessage("Vul een geldig startsaldo in.");
      return;
    }

    setIsSavingSavingsSnapshot(true);
    setSavingsMessage("");

    const response = await fetch("/api/account-balance-snapshots", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        householdId: initialData.householdId,
        accountId: selectedAccount.id,
        balance: amount,
        snapshotDate: savingsStartDate,
        note: SAVINGS_SNAPSHOT_NOTE,
      }),
    });
    const result = await response.json();

    setIsSavingSavingsSnapshot(false);

    if (!response.ok) {
      setSavingsMessage(
        typeof result.error === "string"
          ? result.error
          : "Spaarsaldo opslaan lukte niet.",
      );
      return;
    }

    setBalanceSnapshots((items) => [result.snapshot, ...items]);
    setSavingsStartAmount("");
    setSavingsMessage("Spaarsaldo bijgewerkt.");
  }

  async function addSavingsDeposit() {
    const amount = parseCurrencyInput(savingsDepositAmount);

    if (!selectedAccount || !amount || amount <= 0) {
      setSavingsMessage("Vul een geldig spaarbedrag in.");
      return false;
    }

    setIsSavingSavingsDeposit(true);
    setSavingsMessage("");

    const response = await fetch("/api/transactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        householdId: initialData.householdId,
        accountId: selectedAccount.id,
        amount,
        date: savingsDepositDate,
        note: "Sparen",
        type: "sparen",
        paidById: initialData.currentUserId,
      }),
    });
    const result = await response.json();

    setIsSavingSavingsDeposit(false);

    if (!response.ok) {
      setSavingsMessage(
        typeof result.error === "string"
          ? result.error
          : "Spaarstorting opslaan lukte niet.",
      );
      return false;
    }

    const savingsCategory =
      categories.find((category) => category.name === SAVINGS_CATEGORY_NAME) ??
      ({
        id: result.transaction.categoryId,
        name: SAVINGS_CATEGORY_NAME,
        kind: "variable",
        color: SAVINGS_COLOR,
        averageMonthly: 0,
        sortOrder: 118,
      } satisfies DashboardData["categories"][number]);

    if (!categories.some((category) => category.id === savingsCategory.id)) {
      setCategories((items) =>
        [...items, savingsCategory].sort(
          (first, second) =>
            (first.sortOrder ?? 0) - (second.sortOrder ?? 0) ||
            first.name.localeCompare(second.name, "nl"),
        ),
      );
    }

    setTransactions((items) => [
      {
        id: result.transaction.id,
        type: "sparen",
        accountId: selectedAccount.id,
        accountName: selectedAccount.name,
        accountKind: selectedAccount.kind,
        categoryId: savingsCategory.id,
        amount,
        date: savingsDepositDate,
        note: "Sparen",
        enteredById: initialData.currentUserId,
        enteredBy: initialData.currentPerson,
        paidById: result.transaction.paidById ?? initialData.currentUserId,
        paidBy: initialData.currentPerson,
      },
      ...items,
    ]);
    setSavingsDepositAmount("");
    setSavingsMessage("Spaarstorting toegevoegd.");
    return true;
  }

  async function addDegiroPosition() {
    const amount = parseCurrencyInput(degiroAmount);

    if (
      !degiroName.trim() ||
      !degiroTicker.trim() ||
      Number.isNaN(amount) ||
      amount < 0
    ) {
      setInvestmentMessage("Vul naam, ticker en aantal in.");
      return;
    }

    setIsSavingDegiroPosition(true);
    setInvestmentMessage("");

    const response = await fetch("/api/degiro-positions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: degiroName,
        ticker: degiroTicker,
        amount,
      }),
    });
    const result = await response.json();

    setIsSavingDegiroPosition(false);

    if (!response.ok) {
      setInvestmentMessage(
        typeof result.error === "string"
          ? result.error
          : "DeGiro-positie opslaan lukte niet.",
      );
      return;
    }

    const nextPosition = result.position as DegiroPosition;
    setDegiroPositions((items) =>
      mergeById(items, [nextPosition]).sort((first, second) =>
        first.name.localeCompare(second.name, "nl"),
      ),
    );
    setDegiroName("");
    setDegiroTicker("");
    setDegiroAmount("");
    setInvestmentMessage("DeGiro-positie bijgewerkt.");
  }

  async function deleteDegiroPosition(position: DegiroPosition) {
    const confirmed = window.confirm(`${position.name} verwijderen?`);

    if (!confirmed) return;

    setDeletingDegiroPositionId(position.id);
    setInvestmentMessage("");

    const response = await fetch("/api/degiro-positions", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        positionId: position.id,
      }),
    });
    const result = await response.json();

    setDeletingDegiroPositionId(null);

    if (!response.ok) {
      setInvestmentMessage(
        typeof result.error === "string"
          ? result.error
          : "DeGiro-positie verwijderen lukte niet.",
      );
      return;
    }

    setDegiroPositions((items) =>
      items.filter((item) => item.id !== position.id),
    );
    setInvestmentMessage("DeGiro-positie verwijderd.");
  }

  async function addCryptoPosition() {
    const amount = parseCurrencyInput(cryptoAmount);

    if (
      !cryptoCoinName.trim() ||
      !cryptoCoinId.trim() ||
      !cryptoTicker.trim() ||
      Number.isNaN(amount) ||
      amount < 0
    ) {
      setInvestmentMessage(
        "Vul naam, CoinGecko ID, ticker en hoeveelheid in.",
      );
      return;
    }

    setIsSavingCryptoPosition(true);
    setInvestmentMessage("");

    const response = await fetch("/api/crypto-positions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        coinName: cryptoCoinName,
        coinId: cryptoCoinId,
        ticker: cryptoTicker,
        amount,
      }),
    });
    const result = await response.json();

    setIsSavingCryptoPosition(false);

    if (!response.ok) {
      setInvestmentMessage(
        typeof result.error === "string"
          ? result.error
          : "Crypto-positie opslaan lukte niet.",
      );
      return;
    }

    const nextPosition = result.position as CryptoPosition;
    setCryptoPositions((items) =>
      mergeById(items, [nextPosition]).sort((first, second) =>
        first.coinName.localeCompare(second.coinName, "nl"),
      ),
    );
    setCryptoCoinName("");
    setCryptoCoinId("");
    setCryptoTicker("");
    setCryptoAmount("");
    setInvestmentMessage("Crypto-positie bijgewerkt.");
  }

  async function deleteCryptoPosition(position: CryptoPosition) {
    const confirmed = window.confirm(`${position.coinName} verwijderen?`);

    if (!confirmed) return;

    setDeletingCryptoPositionId(position.id);
    setInvestmentMessage("");

    const response = await fetch("/api/crypto-positions", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        positionId: position.id,
      }),
    });
    const result = await response.json();

    setDeletingCryptoPositionId(null);

    if (!response.ok) {
      setInvestmentMessage(
        typeof result.error === "string"
          ? result.error
          : "Crypto-positie verwijderen lukte niet.",
      );
      return;
    }

    setCryptoPositions((items) =>
      items.filter((item) => item.id !== position.id),
    );
    setInvestmentMessage("Crypto-positie verwijderd.");
  }

  async function addIncome() {
    const amount = parseCurrencyInput(incomeAmount);

    if (!selectedAccount || !amount || amount <= 0) {
      setIncomeMessage("Vul een geldig bedrag in.");
      return;
    }

    setIsSavingIncome(true);
    setIncomeMessage("");

    const response = await fetch("/api/transactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        householdId: initialData.householdId,
        accountId: selectedAccount.id,
        amount,
        date: incomeDate,
        note:
          incomeNote ||
          (incomeKind === "salary" ? "Salaris" : "Extra inkomsten"),
        type: "income",
        incomeKind,
        paidById: initialData.currentUserId,
      }),
    });
    const result = await response.json();

    setIsSavingIncome(false);

    if (!response.ok) {
      setIncomeMessage(
        typeof result.error === "string"
          ? result.error
          : "Inkomen opslaan lukte niet.",
      );
      return;
    }

    const incomeCategory =
      categories.find((category) =>
        incomeKind === "salary"
          ? category.name === "Salaris"
          : category.name === "Extra inkomsten",
      ) ??
      ({
        id: result.transaction.categoryId,
        name: incomeKind === "salary" ? "Salaris" : "Extra inkomsten",
        kind: "variable",
        color: incomeKind === "salary" ? "#10B981" : "#22C55E",
        averageMonthly: 0,
      } satisfies DashboardData["categories"][number]);

    setTransactions((items) => [
      {
        id: result.transaction.id,
        type: "income",
        accountId: selectedAccount.id,
        accountName: selectedAccount.name,
        accountKind: selectedAccount.kind,
        categoryId: incomeCategory.id,
        amount,
        date: incomeDate,
        note:
          incomeNote ||
          (incomeKind === "salary" ? "Salaris" : "Extra inkomsten"),
        enteredById: initialData.currentUserId,
        enteredBy: initialData.currentPerson,
        paidById: result.transaction.paidById ?? initialData.currentUserId,
        paidBy: initialData.currentPerson,
      },
      ...items,
    ]);
    setIncomeAmount("");
    setIncomeNote("");
    setIncomeMessage("Inkomen toegevoegd.");
  }

  async function createVariableCategory(nameInput: string): Promise<{
    category?: DashboardData["categories"][number];
    error?: string;
  }> {
    const name = nameInput.trim().replace(/\s+/g, " ");

    if (name.length < 2) {
      return { error: "Vul een categorienaam in." };
    }

    if (!initialData.householdId) {
      return { error: "Huishouden ontbreekt." };
    }

    const response = await fetch("/api/categories", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        householdId: initialData.householdId,
        name,
      }),
    });
    const result = await response.json();

    if (!response.ok) {
      return {
        error:
          typeof result.error === "string"
            ? result.error
            : "Categorie opslaan lukte niet.",
      };
    }

    const category = result.category as DashboardData["categories"][number];
    setCategories((items) =>
      [...items.filter((item) => item.id !== category.id), category],
    );

    return { category };
  }

  async function addVariableCategory() {
    setIsSavingCategory(true);
    setCategoryMessage("");

    const result = await createVariableCategory(customCategoryName);

    setIsSavingCategory(false);

    if (result.error || !result.category) {
      setCategoryMessage(result.error ?? "Categorie opslaan lukte niet.");
      return;
    }

    const { category } = result;
    setQuickCategory(category.id);
    setCustomCategoryName("");
    setCategoryMessage(`${category.name} is toegevoegd.`);
  }

  async function renameVariableCategory(categoryId: string, name: string) {
    const cleanName = name.trim().replace(/\s+/g, " ");

    if (cleanName.length < 2) {
      setCategoryMessage("Vul een categorienaam in.");
      return;
    }

    setCategoryOperationId(categoryId);
    setCategoryMessage("");

    const response = await fetch("/api/categories", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        householdId: initialData.householdId,
        categoryId,
        name: cleanName,
      }),
    });
    const result = await response.json();

    setCategoryOperationId(null);

    if (!response.ok) {
      setCategoryMessage(
        typeof result.error === "string"
          ? result.error
          : "Categorie wijzigen lukte niet.",
      );
      return;
    }

    const category = result.category as DashboardData["categories"][number];
    setCategories((items) =>
      items.map((item) => (item.id === category.id ? category : item)),
    );
    setCategoryMessage(`${category.name} is gewijzigd.`);
  }

  async function deleteVariableCategory(
    category: DashboardData["categories"][number],
  ) {
    const confirmed = window.confirm(
      `${category.name} verwijderen?\n\nDit kan alleen als er nog geen uitgaven aan deze categorie gekoppeld zijn.`,
    );

    if (!confirmed) return;

    setCategoryOperationId(category.id);
    setCategoryMessage("");

    const response = await fetch("/api/categories", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        householdId: initialData.householdId,
        categoryId: category.id,
      }),
    });
    const result = await response.json();

    setCategoryOperationId(null);

    if (!response.ok) {
      setCategoryMessage(
        typeof result.error === "string"
          ? result.error
          : "Categorie verwijderen lukte niet.",
      );
      return;
    }

    setCategories((items) => items.filter((item) => item.id !== category.id));
    setQuickCategory((currentCategory) =>
      currentCategory === category.id
        ? preferredVariableCategoryId(
            categories.filter((item) => item.id !== category.id),
            transactions,
            initialData.currentUserId,
          ) ?? ""
        : currentCategory,
    );
    setCategoryMessage(`${category.name} is verwijderd.`);
  }

  function updateContributionPlanDraft(
    planId: string,
    field: keyof ContributionPlanDraft,
    value: string,
  ) {
    setContributionPlanDrafts((drafts) => ({
      ...drafts,
      [planId]: {
        label: drafts[planId]?.label ?? "",
        amount: drafts[planId]?.amount ?? "",
        depositDay: drafts[planId]?.depositDay ?? "1",
        [field]: value,
      },
    }));
  }

  function updateNewContributionPlanDraft(
    userId: string,
    field: keyof ContributionPlanDraft,
    value: string,
  ) {
    setNewContributionPlanDrafts((drafts) => ({
      ...drafts,
      [userId]: {
        label: drafts[userId]?.label ?? "",
        amount: drafts[userId]?.amount ?? "",
        depositDay: drafts[userId]?.depositDay ?? "1",
        [field]: value,
      },
    }));
  }

  async function saveContributionPlan(plan: ContributionPlan) {
    const draft = contributionPlanDrafts[plan.id];
    const label = draft?.label?.trim() ?? "";
    const amount = parseCurrencyInput(draft?.amount ?? "");
    const depositDay = Number(draft?.depositDay);

    if (!label) {
      setContributionPlanMessage("Vul een naam voor deze planning in.");
      return;
    }

    if (Number.isNaN(amount) || amount < 0) {
      setContributionPlanMessage("Vul een geldig maandbedrag in.");
      return;
    }

    if (!Number.isInteger(depositDay) || depositDay < 1 || depositDay > 31) {
      setContributionPlanMessage("Kies een dag tussen 1 en 31.");
      return;
    }

    setSavingContributionPlanId(plan.id);
    setContributionPlanMessage("");

    const response = await fetch("/api/contribution-plans", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: plan.id,
        householdId: initialData.householdId,
        label,
        month: currentMonth,
        monthlyAmount: amount,
        depositDay,
      }),
    });
    const result = await response.json();

    setSavingContributionPlanId(null);

    if (!response.ok) {
      setContributionPlanMessage(
        typeof result.error === "string"
          ? result.error
          : "Geplande storting opslaan lukte niet.",
      );
      return;
    }

    const updatedPlan = result.plan as ContributionPlan;
    const deletedTransactionIds = Array.isArray(result.deletedTransactionIds)
      ? (result.deletedTransactionIds as string[])
      : [];

    if (deletedTransactionIds.length > 0) {
      setTransactions((items) =>
        items.filter((item) => !deletedTransactionIds.includes(item.id)),
      );
    }

    setContributionPlans((plans) =>
      sortContributionPlans(
        plans.map((item) => (item.id === updatedPlan.id ? updatedPlan : item)),
      ),
    );
    setContributionPlanDrafts((drafts) => ({
      ...drafts,
      [updatedPlan.id]: {
        label: updatedPlan.label,
        amount: String(updatedPlan.monthlyAmount || ""),
        depositDay: String(updatedPlan.depositDay),
      },
    }));
    setContributionPlanMessage(`${updatedPlan.label} voor ${updatedPlan.person} bewaard.`);
  }

  async function createContributionPlan(member: DashboardData["householdMembers"][number]) {
    const draft = newContributionPlanDrafts[member.userId];
    const label = draft?.label?.trim() ?? "";
    const amount = parseCurrencyInput(draft?.amount ?? "");
    const depositDay = Number(draft?.depositDay);

    if (!defaultAccount) {
      setContributionPlanMessage("Gezamenlijke rekening ontbreekt.");
      return;
    }

    if (!label) {
      setContributionPlanMessage("Vul een naam voor deze planning in.");
      return;
    }

    if (Number.isNaN(amount) || amount < 0) {
      setContributionPlanMessage("Vul een geldig maandbedrag in.");
      return;
    }

    if (!Number.isInteger(depositDay) || depositDay < 1 || depositDay > 31) {
      setContributionPlanMessage("Kies een dag tussen 1 en 31.");
      return;
    }

    const savingId = `new:${member.userId}`;
    setSavingContributionPlanId(savingId);
    setContributionPlanMessage("");

    const response = await fetch("/api/contribution-plans", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        householdId: initialData.householdId,
        accountId: defaultAccount.id,
        userId: member.userId,
        label,
        month: currentMonth,
        monthlyAmount: amount,
        depositDay,
      }),
    });
    const result = await response.json();

    setSavingContributionPlanId(null);

    if (!response.ok) {
      setContributionPlanMessage(
        typeof result.error === "string"
          ? result.error
          : "Planning toevoegen lukte niet.",
      );
      return;
    }

    const createdPlan = result.plan as ContributionPlan;
    const deletedTransactionIds = Array.isArray(result.deletedTransactionIds)
      ? (result.deletedTransactionIds as string[])
      : [];

    if (deletedTransactionIds.length > 0) {
      setTransactions((items) =>
        items.filter((item) => !deletedTransactionIds.includes(item.id)),
      );
    }

    setContributionPlans((plans) => sortContributionPlans([...plans, createdPlan]));
    setContributionPlanDrafts((drafts) => ({
      ...drafts,
      [createdPlan.id]: {
        label: createdPlan.label,
        amount: String(createdPlan.monthlyAmount || ""),
        depositDay: String(createdPlan.depositDay),
      },
    }));
    setNewContributionPlanDrafts((drafts) => ({
      ...drafts,
      [member.userId]: {
        label: "",
        amount: "",
        depositDay: "1",
      },
    }));
    setContributionPlanMessage(`${createdPlan.label} voor ${createdPlan.person} toegevoegd.`);
  }

  async function scanReceipt(file: File) {
    setIsScanningReceipt(true);
    setScanMessage("Bon wordt gelezen...");
    setReceiptDraft(null);
    setReceiptFile(null);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/receipt-scan", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();

      if (!response.ok) {
        setScanMessage(
          typeof result.error === "string"
            ? result.error
            : "Deze bon kon niet duidelijk gelezen worden. Je kunt handmatig verder.",
        );
        return;
      }

      const draft = {
        amount: typeof result.amount === "number" ? result.amount : null,
        date: typeof result.date === "string" ? result.date : null,
        merchant:
          typeof result.merchant === "string" && result.merchant.trim()
            ? result.merchant.trim()
            : null,
      };

      setReceiptDraft(draft);
      setReceiptFile(file);

      if (typeof draft.amount === "number") {
        setQuickAmount(draft.amount.toFixed(2));
      }

      if (draft.date) {
        setQuickDate(draft.date);
      }

      if (draft.merchant) {
        setQuickNote(draft.merchant);
      }

      setScanMessage("Bon gelezen. Controleer, kies categorie en sla op.");
    } catch {
      setScanMessage(
        "Deze bon kon niet gelezen worden. Je kunt handmatig verder.",
      );
    } finally {
      setIsScanningReceipt(false);
    }
  }

  function dismissReceiptDraft() {
    setReceiptDraft(null);
    setReceiptFile(null);
    setScanMessage("Scan verborgen. De ingevulde gegevens blijven staan.");
  }

  async function deleteTransaction(transaction: Transaction) {
    const confirmed = window.confirm(
      transaction.type === "fixed"
        ? "Definitief verwijderen?\n\nDeze vaste-last uitgave verdwijnt uit dit maandoverzicht. De vaste last zelf blijft in de agenda staan."
        : transaction.type === "contribution"
          ? "Definitief verwijderen?\n\nDeze geboekte storting wordt permanent uit het overzicht verwijderd."
        : transaction.type === "income"
          ? "Definitief verwijderen?\n\nDeze inkomensregel wordt permanent uit het overzicht verwijderd."
          : transaction.type === "sparen"
            ? "Definitief verwijderen?\n\nDeze spaarstorting wordt permanent uit het overzicht verwijderd."
            : "Definitief verwijderen?\n\nDeze ingevoerde uitgave wordt permanent uit het maandoverzicht verwijderd.",
    );

    if (!confirmed) return;

    setDeletingTransactionId(transaction.id);
    setMonthMessage("");

    const response = await fetch("/api/transactions", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ transactionId: transaction.id }),
    });
    const result = await response.json();

    setDeletingTransactionId(null);

    if (!response.ok) {
      setMonthMessage(
        typeof result.error === "string"
          ? result.error
          : "Verwijderen lukte niet. Probeer het nog eens.",
      );
      return;
    }

    setTransactions((items) =>
      items.filter((item) => item.id !== transaction.id),
    );

    if (result.fixedInstance) {
      const fixedInstance = result.fixedInstance as FixedExpenseInstance;
      setFixedInstances((items) =>
        items.map((item) =>
          item.id === fixedInstance.id ? fixedInstance : item,
        ),
      );
      setHighlightedFixedInstanceId(fixedInstance.id);
      setFixedMessage(`${fixedInstance.name} staat weer open.`);
    }

    setMonthMessage(
      transaction.type === "contribution"
        ? "Storting verwijderd."
        : transaction.type === "income"
          ? "Inkomen verwijderd."
          : transaction.type === "sparen"
            ? "Spaarstorting verwijderd."
        : "Uitgave verwijderd.",
    );
  }

  function startEditingTransaction(transaction: Transaction) {
    const categoryOptions = transactionCategoryOptions(
      transaction,
      categories,
      variableCategories,
    );
    const safeCategoryId = categoryOptions.some(
      (category) => category.id === transaction.categoryId,
    )
      ? transaction.categoryId
      : categoryOptions[0]?.id ?? transaction.categoryId;

    setEditingTransaction(transaction);
    setEditAmount(transaction.amount.toFixed(2));
    setEditDate(transaction.date);
    setEditNote(transaction.note ?? "");
    setEditCategory(safeCategoryId);
    setEditContributionKind(transaction.contributionKind ?? "extra");
    setEditPaidById(
      transaction.paidById ??
        transaction.enteredById ??
        initialData.currentUserId,
    );
    setEditMessage("");
  }

  function closeTransactionEditor() {
    if (isSavingTransactionEdit) return;

    setEditingTransaction(null);
    setEditMessage("");
  }

  async function saveEditedTransaction() {
    if (!editingTransaction) return;

    const amount = parseCurrencyInput(editAmount);
    const paidByMember =
      initialData.householdMembers.find((member) => member.userId === editPaidById) ??
      initialData.householdMembers.find(
        (member) => member.userId === initialData.currentUserId,
      );

    if (!amount || amount <= 0) {
      setEditMessage("Vul een geldig bedrag in.");
      return;
    }

    if (!editCategory) {
      setEditMessage("Kies een categorie.");
      return;
    }

    if (!editDate) {
      setEditMessage("Kies een datum.");
      return;
    }

    setIsSavingTransactionEdit(true);
    setEditMessage("");

    const response = await fetch("/api/transactions", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transactionId: editingTransaction.id,
        categoryId: editCategory,
        amount,
        date: editDate,
        note: editNote || null,
        contributionKind:
          editingTransaction.type === "contribution"
            ? editContributionKind
            : undefined,
        paidById: paidByMember?.userId ?? initialData.currentUserId,
      }),
    });
    const result = await response.json();

    setIsSavingTransactionEdit(false);

    if (!response.ok) {
      setEditMessage(
        typeof result.error === "string"
          ? result.error
          : "Uitgave wijzigen lukte niet.",
      );
      return;
    }

    const updatedTransaction = result.transaction as {
      categoryId: string;
      amount: number;
      date: string;
      note?: string;
      paidById?: string;
      contributionKind?: ContributionKind;
    };

    setTransactions((items) =>
      items
        .map((item) =>
          item.id === editingTransaction.id
            ? {
                ...item,
                categoryId: updatedTransaction.categoryId,
                amount: Number(updatedTransaction.amount),
                date: updatedTransaction.date,
                note: updatedTransaction.note,
                contributionKind:
                  editingTransaction.type === "contribution"
                    ? updatedTransaction.contributionKind ?? editContributionKind
                    : item.contributionKind,
                paidById:
                  updatedTransaction.paidById ??
                  paidByMember?.userId ??
                  initialData.currentUserId,
                paidBy: paidByMember?.displayName ?? item.paidBy ?? item.enteredBy,
              }
            : item,
        )
        .sort((first, second) => second.date.localeCompare(first.date)),
    );

    if (result.fixedInstance) {
      const fixedInstance = result.fixedInstance as FixedExpenseInstance;
      setFixedInstances((items) =>
        items.map((item) =>
          item.id === fixedInstance.id ? fixedInstance : item,
        ),
      );
      setHighlightedFixedInstanceId(fixedInstance.id);
    }

    setEditingTransaction(null);
    setMonthMessage(
      editingTransaction.type === "sparen"
        ? "Spaarstorting bijgewerkt."
        : "Uitgave bijgewerkt.",
    );
  }

  function resetRecurringForm() {
    setEditingRecurringId(null);
    setRecurringName("");
    setRecurringAmount("");
    setRecurringBillingDay("1");
    setRecurringStartsOn(new Date().toISOString().slice(0, 10));
    setRecurringCategory(fixedCategories[0]?.id ?? "");
  }

  function startEditingRecurring(expense: RecurringExpense) {
    setEditingRecurringId(expense.id);
    setHighlightedRecurringId(expense.id);
    setRecurringName(expense.name);
    setRecurringAmount(String(expense.currentAmount.toFixed(2)));
    setRecurringBillingDay(String(expense.billingDay));
    setRecurringStartsOn(expense.startsOn);
    setRecurringCategory(expense.categoryId);
    setManageMessage("");
  }

  async function saveRecurringExpense() {
    const amount = parseCurrencyInput(recurringAmount);
    const billingDay = Number(recurringBillingDay);

    if (!selectedAccount) {
      setManageMessage("Kies een rekening voor deze vaste last.");
      return;
    }

    if (
      !recurringName.trim() ||
      !recurringCategory ||
      !amount ||
      amount <= 0 ||
      !Number.isInteger(billingDay) ||
      billingDay < 1 ||
      billingDay > 31
    ) {
      setManageMessage(
        "Vul naam, categorie, maandbedrag en afschrijfdag in.",
      );
      return;
    }

    setIsSavingRecurring(true);
    setManageMessage("");

    const response = await fetch("/api/recurring-expenses", {
      method: editingRecurringId ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: editingRecurringId,
        householdId: initialData.householdId,
        accountId: selectedAccount.id,
        name: recurringName.trim(),
        categoryId: recurringCategory,
        currentAmount: amount,
        billingDay,
        startsOn: recurringStartsOn,
      }),
    });
    const result = await response.json();

    setIsSavingRecurring(false);

    if (!response.ok) {
      setManageMessage(
        typeof result.error === "string"
          ? result.error
          : "Opslaan lukte niet. Probeer het nog eens.",
      );
      return;
    }

    const recurringExpense = result.recurringExpense as RecurringExpense;
    const fixedInstance = result.fixedInstance as FixedExpenseInstance | null;
    const resolvedCategory = result.category as
      | DashboardData["categories"][number]
      | undefined;
    const wasEditing = Boolean(editingRecurringId);

    if (resolvedCategory) {
      setCategories((items) =>
        [...items.filter((item) => item.id !== resolvedCategory.id), resolvedCategory].sort(
          (first, second) =>
            (first.sortOrder ?? 0) - (second.sortOrder ?? 0) ||
            first.name.localeCompare(second.name, "nl"),
        ),
      );
    }

    setRecurringExpenses((items) =>
      editingRecurringId
        ? items.map((item) =>
            item.id === recurringExpense.id ? recurringExpense : item,
          )
        : [...items, recurringExpense].sort((a, b) =>
            a.name.localeCompare(b.name, "nl"),
          ),
    );

    if (fixedInstance) {
      setFixedInstances((items) => {
        const exists = items.some((item) => item.id === fixedInstance.id);
        const nextItems = exists
          ? items.map((item) => (item.id === fixedInstance.id ? fixedInstance : item))
          : [...items, fixedInstance];

        return nextItems.sort((a, b) => a.name.localeCompare(b.name, "nl"));
      });
    }

    setHighlightedRecurringId(recurringExpense.id);
    setHighlightedFixedInstanceId(fixedInstance?.id ?? null);
    setFixedMessage(
      fixedInstance
        ? `${recurringExpense.name} staat nu open bij deze maand.`
        : `${recurringExpense.name} is opgeslagen.`,
    );
    resetRecurringForm();
    setManageMessage(
      wasEditing
        ? `${recurringExpense.name} is bijgewerkt.`
        : `${recurringExpense.name} is toegevoegd.`,
    );
  }

  async function deleteRecurringExpense(expense: RecurringExpense) {
    const confirmed = window.confirm(
      `${expense.name} definitief uit vaste lasten verwijderen?\n\nHistorische uitgaven blijven bewaard.`,
    );

    if (!confirmed) return;

    setIsSavingRecurring(true);
    setManageMessage("");

    const response = await fetch("/api/recurring-expenses", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: expense.id,
        householdId: initialData.householdId,
      }),
    });
    const result = await response.json();

    setIsSavingRecurring(false);

    if (!response.ok) {
      setManageMessage(
        typeof result.error === "string"
          ? result.error
          : "Verwijderen lukte niet. Probeer het nog eens.",
      );
      return;
    }

    const removedInstanceIds = Array.isArray(result.removedInstanceIds)
      ? (result.removedInstanceIds as string[])
      : [];

    setRecurringExpenses((items) =>
      items.filter((item) => item.id !== expense.id),
    );
    setFixedInstances((items) =>
      items.filter(
        (item) =>
          item.recurringExpenseId !== expense.id &&
          !removedInstanceIds.includes(item.id),
      ),
    );

    if (editingRecurringId === expense.id) {
      resetRecurringForm();
    }

    setHighlightedRecurringId(null);
    setHighlightedFixedInstanceId(null);
    setFixedMessage(`${expense.name} staat niet meer in de agenda.`);
    setManageMessage(`${expense.name} is verwijderd uit vaste lasten.`);
  }

  function transactionsForMonth(targetMonth: string) {
    return selectedTransactions
      .filter((transaction) => transaction.date.startsWith(targetMonth))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  function fixedAgendaItemsForMonth(targetMonth: string) {
    return buildFixedAgendaItems(
      selectedRecurringExpenses,
      selectedFixedInstances,
      targetMonth,
      labels,
    );
  }

  function fixedItemsTotal(items: FixedAgendaItem[]) {
    return items.reduce(
      (total, item) => (item.state === "skipped" ? total : total + item.amount),
      0,
    );
  }

  function transactionsForRange(fromMonth: string, toMonth: string) {
    const [from, to] = normalizeMonthRange(fromMonth, toMonth);

    return selectedTransactions
      .filter((transaction) => monthInRange(transaction.date.slice(0, 7), from, to))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async function exportExcel(targetMonth = currentMonth) {
    const exportTransactions = transactionsForMonth(targetMonth);
    const exportTotals = totalsForMonth(selectedTransactions, targetMonth);
    const exportFixedItems = fixedAgendaItemsForMonth(targetMonth);
    const exportFixedTotal = fixedItemsTotal(exportFixedItems);
    const exportNetTotal =
      exportTotals.contributionTotal +
      exportTotals.incomeTotal -
      exportFixedTotal -
      exportTotals.variableTotal -
      exportTotals.savingsTotal;
    const summaryRows = [
      {
        Rekening: selectedAccount?.name ?? viewCopy.label,
        Maand: monthLabel(targetMonth),
        Stortingen: exportTotals.contributionTotal,
        Inkomen: exportTotals.incomeTotal,
        "Vaste lasten": exportFixedTotal,
        Variabel: exportTotals.variableTotal,
        Sparen: exportTotals.savingsTotal,
        "Over/tekort": exportNetTotal,
        Uitgaven: exportTransactions.length,
        "Bonnen aanwezig": exportTransactions.filter(
          (transaction) => transaction.receiptUrl,
        ).length,
      },
    ];
    const rows = exportTransactions.map((transaction) => ({
      Datum: transaction.date,
      Rekening: transaction.accountName ?? "",
      Type:
        transaction.type === "fixed"
          ? "Vaste last"
          : transaction.type === "income"
            ? "Inkomen"
          : transaction.type === "contribution"
            ? "Storting"
          : transaction.type === "sparen"
            ? "Sparen"
            : "Variabel",
      Categorie:
        transaction.type === "contribution"
          ? contributionDisplayName(transaction)
          : transaction.type === "income"
            ? labels.get(transaction.categoryId)?.name ?? "Inkomen"
          : transaction.type === "sparen"
            ? SAVINGS_CATEGORY_NAME
          : labels.get(transaction.categoryId)?.name ?? "Onbekend",
      Bedrag: transaction.amount,
      BetaaldDoor: transaction.paidBy ?? transaction.enteredBy,
      IngevoerdDoor: transaction.type === "fixed" ? "" : transaction.enteredBy,
      "Bon aanwezig": transaction.receiptUrl ? "Ja" : "Nee",
      Notitie: transaction.note ?? "",
    }));
    const fixedRows = exportFixedItems.map((item) => ({
      Datum: item.date,
      Dag: item.day,
      Naam: item.name,
      Categorie: item.categoryName,
      Bedrag: item.amount,
      Status: agendaStateLabel(item.state),
      Notitie: item.note ?? "",
    }));

    const workbook = XLSX.utils.book_new();

    appendFinanceSheet(workbook, "Samenvatting", summaryRows, {
      currencyColumns: [
        "Stortingen",
        "Inkomen",
        "Vaste lasten",
        "Variabel",
        "Sparen",
        "Over/tekort",
      ],
      widths: {
        Rekening: 26,
        Maand: 18,
        Stortingen: 15,
        Inkomen: 15,
        "Vaste lasten": 15,
        Variabel: 15,
        Sparen: 15,
        "Over/tekort": 15,
      },
    });
    appendFinanceSheet(workbook, "Alle transacties", rows, {
      currencyColumns: ["Bedrag"],
      widths: {
        Datum: 14,
        Rekening: 24,
        Type: 16,
        Categorie: 22,
        Bedrag: 14,
        BetaaldDoor: 18,
        IngevoerdDoor: 18,
        "Bon aanwezig": 14,
        Notitie: 34,
      },
    });
    appendFinanceSheet(workbook, "Vaste lasten status", fixedRows, {
      currencyColumns: ["Bedrag"],
      widths: {
        Datum: 14,
        Dag: 8,
        Naam: 28,
        Categorie: 22,
        Bedrag: 14,
        Status: 18,
        Notitie: 34,
      },
    });
    await writeFinanceWorkbook(workbook, `huishouden-${targetMonth}.xlsx`);
  }

  async function exportExcelRange(fromMonth: string, toMonth: string) {
    const [from, to] = normalizeMonthRange(fromMonth, toMonth);
    const rangeMonths = monthsInRange(from, to);
    const exportTransactions = transactionsForRange(from, to);
    const summaryRows = rangeMonths.map((month) => {
      const monthTransactionsForExport = exportTransactions.filter(
        (transaction) => transaction.date.startsWith(month),
      );
      const totals = totalsForMonth(selectedTransactions, month);
      const fixedTotal = fixedItemsTotal(fixedAgendaItemsForMonth(month));
      const netTotal =
        totals.contributionTotal +
        totals.incomeTotal -
        fixedTotal -
        totals.variableTotal -
        totals.savingsTotal;

      return {
        Rekening: selectedAccount?.name ?? viewCopy.label,
        Maand: monthLabel(month),
        Stortingen: totals.contributionTotal,
        Inkomen: totals.incomeTotal,
        "Vaste lasten": fixedTotal,
        Variabel: totals.variableTotal,
        Sparen: totals.savingsTotal,
        "Over/tekort": netTotal,
        Uitgaven: monthTransactionsForExport.length,
        "Bonnen aanwezig": monthTransactionsForExport.filter(
          (transaction) => transaction.receiptUrl,
        ).length,
      };
    });
    const rows = exportTransactions.map((transaction) => ({
      Datum: transaction.date,
      Maand: monthLabel(transaction.date.slice(0, 7)),
      Rekening: transaction.accountName ?? "",
      Type:
        transaction.type === "fixed"
          ? "Vaste last"
          : transaction.type === "income"
            ? "Inkomen"
          : transaction.type === "contribution"
            ? "Storting"
          : transaction.type === "sparen"
            ? "Sparen"
            : "Variabel",
      Categorie:
        transaction.type === "contribution"
          ? contributionDisplayName(transaction)
          : transaction.type === "income"
            ? labels.get(transaction.categoryId)?.name ?? "Inkomen"
          : transaction.type === "sparen"
            ? SAVINGS_CATEGORY_NAME
          : labels.get(transaction.categoryId)?.name ?? "Onbekend",
      Bedrag: transaction.amount,
      BetaaldDoor: transaction.paidBy ?? transaction.enteredBy,
      IngevoerdDoor: transaction.type === "fixed" ? "" : transaction.enteredBy,
      "Bon aanwezig": transaction.receiptUrl ? "Ja" : "Nee",
      Notitie: transaction.note ?? "",
    }));
    const fixedRows = rangeMonths.flatMap((month) =>
      fixedAgendaItemsForMonth(month).map((item) => ({
        Maand: monthLabel(month),
        Datum: item.date,
        Dag: item.day,
        Naam: item.name,
        Categorie: item.categoryName,
        Bedrag: item.amount,
        Status: agendaStateLabel(item.state),
        Notitie: item.note ?? "",
      })),
    );

    const workbook = XLSX.utils.book_new();

    appendFinanceSheet(workbook, "Samenvatting", summaryRows, {
      currencyColumns: [
        "Stortingen",
        "Inkomen",
        "Vaste lasten",
        "Variabel",
        "Sparen",
        "Over/tekort",
      ],
      widths: {
        Rekening: 26,
        Maand: 18,
        Stortingen: 15,
        Inkomen: 15,
        "Vaste lasten": 15,
        Variabel: 15,
        Sparen: 15,
        "Over/tekort": 15,
      },
    });
    appendFinanceSheet(workbook, "Alle transacties", rows, {
      currencyColumns: ["Bedrag"],
      widths: {
        Datum: 14,
        Maand: 18,
        Rekening: 24,
        Type: 16,
        Categorie: 22,
        Bedrag: 14,
        BetaaldDoor: 18,
        IngevoerdDoor: 18,
        "Bon aanwezig": 14,
        Notitie: 34,
      },
    });
    appendFinanceSheet(workbook, "Vaste lasten status", fixedRows, {
      currencyColumns: ["Bedrag"],
      widths: {
        Maand: 18,
        Datum: 14,
        Dag: 8,
        Naam: 28,
        Categorie: 22,
        Bedrag: 14,
        Status: 18,
        Notitie: 34,
      },
    });
    await writeFinanceWorkbook(workbook, `huishouden-${from}-tm-${to}.xlsx`);
  }

  function appendFinanceSheet(
    workbook: XLSX.WorkBook,
    sheetName: string,
    rows: Array<Record<string, string | number>>,
    options: {
      currencyColumns?: string[];
      widths?: Record<string, number>;
    } = {},
  ) {
    const worksheet = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{}]);

    formatFinanceWorksheet(worksheet, options);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  }

  function formatFinanceWorksheet(
    worksheet: XLSX.WorkSheet,
    options: {
      currencyColumns?: string[];
      widths?: Record<string, number>;
    },
  ) {
    if (!worksheet["!ref"]) return;

    const range = XLSX.utils.decode_range(worksheet["!ref"]);
    const headers = Array.from({ length: range.e.c - range.s.c + 1 }, (_, index) => {
      const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: range.s.c + index });
      return String(worksheet[cellAddress]?.v ?? "");
    });
    const currencyColumns = new Set(options.currencyColumns ?? []);
    const subtotalRow = range.e.r + 1;
    const labelColumn =
      headers.findIndex((header) => !currencyColumns.has(header)) >= 0
        ? headers.findIndex((header) => !currencyColumns.has(header))
        : 0;

    worksheet["!autofilter"] = { ref: XLSX.utils.encode_range(range) };
    (worksheet as XLSX.WorkSheet & {
      "!freeze"?: {
        xSplit: number;
        ySplit: number;
        topLeftCell: string;
        activePane: string;
        state: string;
      };
    })["!freeze"] = {
      xSplit: 0,
      ySplit: 1,
      topLeftCell: "A2",
      activePane: "bottomLeft",
      state: "frozen",
    };
    worksheet["!ref"] = XLSX.utils.encode_range({
      s: range.s,
      e: { r: subtotalRow, c: range.e.c },
    });

    headers.forEach((header, index) => {
      const column = range.s.c + index;
      const cellAddress = XLSX.utils.encode_cell({ r: subtotalRow, c: column });

      if (index === labelColumn) {
        worksheet[cellAddress] = {
          t: "s",
          v: "Totaal",
          s: {
            font: { bold: true },
            fill: { fgColor: { rgb: "F4F4F5" } },
          },
        };
        return;
      }

      if (!currencyColumns.has(header)) {
        return;
      }

      const firstDataCell = XLSX.utils.encode_cell({ r: range.s.r + 1, c: column });
      const lastDataCell = XLSX.utils.encode_cell({ r: range.e.r, c: column });

      worksheet[cellAddress] = {
        t: "n",
        f: `SUBTOTAL(9,${firstDataCell}:${lastDataCell})`,
        z: '"€" #,##0.00;-"€" #,##0.00',
        s: {
          font: { bold: true },
          fill: { fgColor: { rgb: "F4F4F5" } },
          alignment: { horizontal: "right" },
        },
      };
    });
    worksheet["!cols"] = headers.map((header, index) => {
      let maxLength = header.length;

      for (let row = range.s.r + 1; row <= subtotalRow; row += 1) {
        const cellAddress = XLSX.utils.encode_cell({
          r: row,
          c: range.s.c + index,
        });
        const cell = worksheet[cellAddress];

        if (!cell || cell.v === null || cell.v === undefined) continue;

        const displayValue =
          currencyColumns.has(header) && typeof cell.v === "number"
            ? preciseCurrency(cell.v)
            : String(cell.v);
        maxLength = Math.max(maxLength, displayValue.length);
      }

      return {
        wch: Math.min(
          Math.max(options.widths?.[header] ?? 12, maxLength + 3),
          header === "Notitie" ? 64 : 42,
        ),
      };
    });

    for (let row = range.s.r; row <= subtotalRow; row += 1) {
      for (let column = range.s.c; column <= range.e.c; column += 1) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: column });
        const cell = worksheet[cellAddress] as
          | (XLSX.CellObject & { s?: Record<string, unknown> })
          | undefined;

        if (!cell) continue;

        if (row === range.s.r) {
          cell.s = {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "1E1E2E" } },
          };
          continue;
        }

        if (row === subtotalRow) {
          cell.s = {
            ...(cell.s ?? {}),
            font: { bold: true },
            fill: { fgColor: { rgb: "F4F4F5" } },
          };
        }

        const header = headers[column - range.s.c];

        if (currencyColumns.has(header) && typeof cell.v === "number") {
          cell.z = '"€" #,##0.00;-"€" #,##0.00';
          cell.s = { alignment: { horizontal: "right" } };
        }
      }
    }
  }

  async function writeFinanceWorkbook(workbook: XLSX.WorkBook, filename: string) {
    const { default: JSZip } = await import("jszip");
    const workbookData = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
      cellStyles: true,
    }) as ArrayBuffer;
    const zip = await JSZip.loadAsync(workbookData);
    const stylesEntry = zip.file("xl/styles.xml");
    const stylesXml = await stylesEntry?.async("string");

    if (stylesXml) {
      const { xml, headerStyleIndex } = addExcelHeaderStyle(stylesXml);
      zip.file("xl/styles.xml", xml);

      await Promise.all(
        workbook.SheetNames.map(async (_, index) => {
          const path = `xl/worksheets/sheet${index + 1}.xml`;
          const sheetEntry = zip.file(path);
          const sheetXml = await sheetEntry?.async("string");

          if (!sheetXml) return;

          zip.file(path, styleFinanceWorksheetXml(sheetXml, headerStyleIndex));
        }),
      );
    }

    const blob = await zip.generateAsync({
      type: "blob",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    downloadBlob(blob, filename);
  }

  function addExcelHeaderStyle(stylesXml: string) {
    const parser = new DOMParser();
    const document = parser.parseFromString(stylesXml, "application/xml");
    const namespace = document.documentElement.namespaceURI ?? "";
    const fonts = document.getElementsByTagName("fonts")[0];
    const fills = document.getElementsByTagName("fills")[0];
    const cellXfs = document.getElementsByTagName("cellXfs")[0];
    const fontId = fonts.children.length;
    const fillId = fills.children.length;
    const headerStyleIndex = cellXfs.children.length;
    const font = document.createElementNS(namespace, "font");
    const bold = document.createElementNS(namespace, "b");
    const color = document.createElementNS(namespace, "color");
    const name = document.createElementNS(namespace, "name");
    const family = document.createElementNS(namespace, "family");
    const fill = document.createElementNS(namespace, "fill");
    const patternFill = document.createElementNS(namespace, "patternFill");
    const fgColor = document.createElementNS(namespace, "fgColor");
    const bgColor = document.createElementNS(namespace, "bgColor");
    const xf = document.createElementNS(namespace, "xf");
    const alignment = document.createElementNS(namespace, "alignment");

    color.setAttribute("rgb", "FFFFFFFF");
    name.setAttribute("val", "Calibri");
    family.setAttribute("val", "2");
    font.append(bold, color, name, family);
    fonts.append(font);
    fonts.setAttribute("count", String(fonts.children.length));

    patternFill.setAttribute("patternType", "solid");
    fgColor.setAttribute("rgb", "FF1E1E2E");
    bgColor.setAttribute("indexed", "64");
    patternFill.append(fgColor, bgColor);
    fill.append(patternFill);
    fills.append(fill);
    fills.setAttribute("count", String(fills.children.length));

    xf.setAttribute("numFmtId", "0");
    xf.setAttribute("fontId", String(fontId));
    xf.setAttribute("fillId", String(fillId));
    xf.setAttribute("borderId", "0");
    xf.setAttribute("xfId", "0");
    xf.setAttribute("applyFont", "1");
    xf.setAttribute("applyFill", "1");
    xf.setAttribute("applyAlignment", "1");
    alignment.setAttribute("horizontal", "center");
    alignment.setAttribute("vertical", "center");
    xf.append(alignment);
    cellXfs.append(xf);
    cellXfs.setAttribute("count", String(cellXfs.children.length));

    return {
      xml: new XMLSerializer().serializeToString(document),
      headerStyleIndex,
    };
  }

  function styleFinanceWorksheetXml(
    sheetXml: string,
    headerStyleIndex: number,
  ) {
    const parser = new DOMParser();
    const document = parser.parseFromString(sheetXml, "application/xml");
    const namespace = document.documentElement.namespaceURI ?? "";
    const sheetView = document.getElementsByTagName("sheetView")[0];
    const headerRow = Array.from(document.getElementsByTagName("row")).find(
      (row) => row.getAttribute("r") === "1",
    );

    if (sheetView) {
      Array.from(sheetView.getElementsByTagName("pane")).forEach((pane) =>
        pane.remove(),
      );
      Array.from(sheetView.getElementsByTagName("selection")).forEach(
        (selection) => selection.remove(),
      );

      const pane = document.createElementNS(namespace, "pane");
      const selection = document.createElementNS(namespace, "selection");

      pane.setAttribute("ySplit", "1");
      pane.setAttribute("topLeftCell", "A2");
      pane.setAttribute("activePane", "bottomLeft");
      pane.setAttribute("state", "frozen");
      selection.setAttribute("pane", "bottomLeft");
      sheetView.append(pane, selection);
    }

    headerRow
      ?.querySelectorAll("c")
      .forEach((cell) => cell.setAttribute("s", String(headerStyleIndex)));

    return new XMLSerializer().serializeToString(document);
  }

  async function exportPdf(targetMonth = currentMonth) {
    const { pdf } = await import("@react-pdf/renderer");
    const exportTransactions = transactionsForMonth(targetMonth);
    const receiptImages = await loadReceiptImagesForPdf(exportTransactions);
    const fixedItems = fixedAgendaItemsForMonth(targetMonth).map(
      (item) =>
        ({
          id: item.id,
          date: item.date,
          name: item.name,
          categoryName: item.categoryName,
          amount: item.amount,
          status: agendaStateLabel(item.state),
          note: item.note,
        }) satisfies MonthReportFixedItem,
    );
    const blob = await pdf(
      <MonthReportDocument
        month={targetMonth}
        accountName={selectedAccount?.name ?? viewCopy.label}
        transactions={exportTransactions}
        categories={categories}
        fixedItems={fixedItems}
        trend={sixMonthTrend(selectedTransactions, targetMonth)}
        generatedAt={new Date().toLocaleDateString("nl-NL")}
        receiptImages={receiptImages}
      />,
    ).toBlob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `maandrapport-${targetMonth}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function downloadReceiptZip(targetMonth = currentMonth) {
    const receiptTransactions = transactionsForMonth(targetMonth).filter(
      (transaction): transaction is Transaction & { receiptUrl: string } =>
        Boolean(transaction.receiptUrl),
    );

    if (!receiptTransactions.length) {
      return;
    }

    setMonthMessage(`Bonnen voor ${monthLabel(targetMonth)} worden gebundeld...`);

    try {
      const { default: JSZip } = await import("jszip");
      const supabase = getSupabaseBrowserClient();
      const zip = new JSZip();
      const usedNames = new Map<string, number>();

      for (const transaction of receiptTransactions) {
        const { data, error } = await supabase.storage
          .from("receipts")
          .download(transaction.receiptUrl);

        if (error || !data) {
          throw error ?? new Error("Bon kon niet worden gedownload.");
        }

        const categoryName =
          transaction.type === "contribution"
            ? contributionDisplayName(transaction)
            : transaction.type === "income"
              ? labels.get(transaction.categoryId)?.name ?? "Inkomen"
              : labels.get(transaction.categoryId)?.name ?? "Onbekend";
        const baseName = [
          transaction.date,
          fileNamePart(categoryName),
          fileAmountPart(transaction.amount),
        ].join("-");

        zip.file(uniqueZipFileName(`${baseName}.jpg`, usedNames), data);
      }

      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, `bonnen-${targetMonth}.zip`);
      setMonthMessage(`Bonnen voor ${monthLabel(targetMonth)} zijn gedownload.`);
    } catch {
      setMonthMessage(
        "Bonnen downloaden lukte niet. Probeer het later nog eens.",
      );
    }
  }

  async function downloadReceiptZipRange(fromMonth: string, toMonth: string) {
    const [from, to] = normalizeMonthRange(fromMonth, toMonth);
    const receiptTransactions = transactionsForRange(from, to).filter(
      (transaction): transaction is Transaction & { receiptUrl: string } =>
        Boolean(transaction.receiptUrl),
    );

    if (!receiptTransactions.length) {
      return;
    }

    setMonthMessage(
      `Bonnen voor ${monthLabel(from)} t/m ${monthLabel(to)} worden gebundeld...`,
    );

    try {
      const { default: JSZip } = await import("jszip");
      const supabase = getSupabaseBrowserClient();
      const zip = new JSZip();
      const usedNames = new Map<string, number>();

      for (const transaction of receiptTransactions) {
        const { data, error } = await supabase.storage
          .from("receipts")
          .download(transaction.receiptUrl);

        if (error || !data) {
          throw error ?? new Error("Bon kon niet worden gedownload.");
        }

        const categoryName =
          transaction.type === "contribution"
            ? contributionDisplayName(transaction)
            : transaction.type === "income"
              ? labels.get(transaction.categoryId)?.name ?? "Inkomen"
              : labels.get(transaction.categoryId)?.name ?? "Onbekend";
        const month = transaction.date.slice(0, 7);
        const baseName = [
          month,
          transaction.date,
          fileNamePart(categoryName),
          fileAmountPart(transaction.amount),
        ].join("/");

        zip.file(uniqueZipFileName(`${baseName}.jpg`, usedNames), data);
      }

      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, `bonnen-${from}-tm-${to}.zip`);
      setMonthMessage(
        `Bonnen voor ${monthLabel(from)} t/m ${monthLabel(to)} zijn gedownload.`,
      );
    } catch {
      setMonthMessage(
        "Bonnen downloaden lukte niet. Probeer het later nog eens.",
      );
    }
  }

  const isMobileFixedManagerVisible =
    isMobileFixedManagerOpen || Boolean(editingRecurringId);

  return (
    <main className="min-h-dvh overflow-x-hidden bg-[var(--bg-base)] pb-[calc(84px+env(safe-area-inset-bottom))] text-[var(--text-primary)] lg:pb-0">
      <div className="mx-auto w-full max-w-[1800px] px-3 py-3 sm:px-6 sm:py-4 lg:px-8 2xl:px-10">
        <MobileBottomNav
          activeSection={activeSection}
          onSectionChange={(section) => {
            setActiveSection(section);
            window.scrollTo({ top: 0, behavior: "auto" });
          }}
        />

        <section
          className={cn(
            "finance-view gap-2.5 lg:hidden",
            activeSection === "dashboard" ? "grid" : "hidden",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-[var(--text-primary)] sm:text-2xl">
                Finance
              </h1>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)] sm:text-sm">
                Familie Wijnands
              </p>
            </div>
            <Badge className="h-8 border-[var(--border)] bg-[var(--bg-surface)] px-2 text-xs text-[var(--text-secondary)]">
              {initialData.currentPerson}
            </Badge>
          </div>

          <AccountPills
            tabs={accountTabs}
            selectedAccountId={selectedAccountId}
            onSelect={(accountId) => {
              setSelectedAccountId(accountId);
              setQuickAccount(accountId);
            }}
          />

          {showOpeningBalanceReminder && (
            <div className="rounded-[14px] border border-[var(--border)] bg-[var(--accent-light)] px-3 py-2 text-sm text-[var(--text-secondary)]">
              Nieuwe maand — vergeet je openingssaldo niet in te voeren.
            </div>
          )}

          <DashboardHero
            label={viewCopy.label}
            value={dashboardPrimaryValue}
            subtext={dashboardPrimarySubtext}
            metrics={dashboardMetrics.slice(0, 3)}
            mobile
          />
          <CashflowTimelineCard
            points={cashflowTimeline}
            month={currentMonth}
            buffer={cashflowBuffer}
            startSnapshot={cashflowStartSnapshot}
            chartReady={mobileChartsReady}
            onBufferChange={(value) =>
              updateCashflowBuffer(selectedAccountId, value)
            }
            compact
          />
        </section>

        <section
          className={cn(
            "finance-view gap-4 lg:hidden",
            activeSection === "fixed" ? "grid" : "hidden",
          )}
        >
          <MobileSectionHeader
            title="Vaste lasten"
            subtitle={monthLabel(currentMonth)}
            action={
              <Button
                type="button"
                variant={isMobileFixedManagerVisible ? "secondary" : "ghost"}
                className="h-11 px-3 text-sm"
                onClick={() => {
                  if (isMobileFixedManagerVisible) {
                    if (editingRecurringId) {
                      resetRecurringForm();
                    }
                    setIsMobileFixedManagerOpen(false);
                    return;
                  }

                  setIsMobileFixedManagerOpen(true);
                }}
              >
                <Plus
                  className={cn(
                    "h-4 w-4 transition",
                    isMobileFixedManagerVisible && "rotate-45",
                  )}
                />
                {isMobileFixedManagerVisible ? "Sluiten" : "Beheren"}
              </Button>
            }
          />
          <FixedExpenseAgenda
            items={fixedAgendaItems}
            transactions={selectedTransactions}
            plannedContributions={isSharedView ? contributionPlanRows : []}
            currentMonth={currentMonth}
            message={fixedMessage}
            highlightedId={highlightedFixedInstanceId}
            skippingId={skippingFixedInstanceId}
            onSkip={skipFixedExpense}
          />
          {isMobileFixedManagerVisible && (
            <FixedExpenseManager
              expenses={selectedRecurringExpenses}
              categories={fixedCategories}
              labels={labels}
              accountName={selectedAccount?.name ?? viewCopy.label}
              name={recurringName}
              amount={recurringAmount}
              billingDay={recurringBillingDay}
              startsOn={recurringStartsOn}
              category={recurringCategory}
              editingId={editingRecurringId}
              highlightedId={highlightedRecurringId}
              message={manageMessage}
              isSaving={isSavingRecurring}
              defaultOpen
              hideHeader
              onNameChange={setRecurringName}
              onAmountChange={setRecurringAmount}
              onBillingDayChange={setRecurringBillingDay}
              onStartsOnChange={setRecurringStartsOn}
              onCategoryChange={setRecurringCategory}
              onSave={saveRecurringExpense}
              onEdit={startEditingRecurring}
              onDelete={deleteRecurringExpense}
              onCancel={resetRecurringForm}
            />
          )}
        </section>

        <section
          className={cn(
            "finance-view gap-4 lg:hidden",
            activeSection === "vermogen" ? "grid" : "hidden",
          )}
        >
          <MobileSectionHeader
            title="Vermogen"
            subtitle={selectedAccount?.name ?? viewCopy.label}
          />
          <SavingsCard
            accountName={
              isSharedView
                ? "Gezamenlijke spaarrekening"
                : `${initialData.currentPerson} spaarrekening`
            }
            snapshot={latestSavingsSnapshot}
            currentBalance={currentSavingsBalance}
            depositTotal={savingsDepositTotalToDate}
            suggestionAmount={savingsSuggestionAmount}
            startAmount={savingsStartAmount}
            startDate={savingsStartDate}
            depositAmount={savingsDepositAmount}
            depositDate={savingsDepositDate}
            message={savingsMessage}
            isSavingSnapshot={isSavingSavingsSnapshot}
            isSavingDeposit={isSavingSavingsDeposit}
            onStartAmountChange={setSavingsStartAmount}
            onStartDateChange={setSavingsStartDate}
            onDepositAmountChange={setSavingsDepositAmount}
            onDepositDateChange={setSavingsDepositDate}
            onSaveStartBalance={saveSavingsSnapshot}
            onAddDeposit={addSavingsDeposit}
          />
          {showInvestmentSection && (
            <InvestmentSection
              degiroPositions={degiroPositions}
              degiroName={degiroName}
              degiroTicker={degiroTicker}
              degiroAmount={degiroAmount}
              cryptoPositions={cryptoPositions}
              cryptoCoinName={cryptoCoinName}
              cryptoCoinId={cryptoCoinId}
              cryptoTicker={cryptoTicker}
              cryptoAmount={cryptoAmount}
              message={investmentMessage}
              isSavingDegiroPosition={isSavingDegiroPosition}
              isSavingCryptoPosition={isSavingCryptoPosition}
              deletingDegiroPositionId={deletingDegiroPositionId}
              deletingCryptoPositionId={deletingCryptoPositionId}
              onDegiroNameChange={setDegiroName}
              onDegiroTickerChange={setDegiroTicker}
              onDegiroAmountChange={setDegiroAmount}
              onAddDegiroPosition={addDegiroPosition}
              onDeleteDegiroPosition={deleteDegiroPosition}
              onCryptoCoinNameChange={setCryptoCoinName}
              onCryptoCoinIdChange={setCryptoCoinId}
              onCryptoTickerChange={setCryptoTicker}
              onCryptoAmountChange={setCryptoAmount}
              onAddCryptoPosition={addCryptoPosition}
              onDeleteCryptoPosition={deleteCryptoPosition}
            />
          )}
        </section>

        <section
          className={cn(
            "finance-view gap-3 lg:hidden",
            activeSection === "input" ? "grid" : "hidden",
          )}
        >
          <QuickEntryCard
            title={viewCopy.quickTitle}
            amount={quickAmount}
            account={quickAccount}
            date={quickDate}
            note={quickNote}
            category={activeQuickCategory}
            paidById={quickPaidById}
            householdMembers={initialData.householdMembers}
            onAmountChange={setQuickAmount}
            onAccountChange={setQuickAccount}
            onDateChange={setQuickDate}
            onNoteChange={setQuickNote}
            onCategoryChange={setQuickCategory}
            onPaidByChange={setQuickPaidById}
            isScanningReceipt={isScanningReceipt}
            scanMessage={scanMessage}
            receiptDraft={receiptDraft}
            onScanReceipt={scanReceipt}
            onDismissReceiptDraft={dismissReceiptDraft}
            variableCategories={variableCategories}
            accounts={initialData.accounts}
            categoryUsageCounts={categoryUsageCounts}
            customCategoryName={customCategoryName}
            categoryMessage={categoryMessage}
            isSavingCategory={isSavingCategory}
            categoryOperationId={categoryOperationId}
            onCustomCategoryNameChange={setCustomCategoryName}
            onAddCategory={addVariableCategory}
            onRenameCategory={renameVariableCategory}
            onDeleteCategory={deleteVariableCategory}
            onSubmit={addVariableExpense}
          />
          <AccountBalanceCard
            accountName={selectedAccount?.name ?? viewCopy.label}
            snapshot={latestBalanceSnapshot}
            labels={labels}
            balanceAmount={balanceAmount}
            balanceDate={balanceDate}
            balanceMessage={balanceMessage}
            isSavingBalance={isSavingBalance}
            incomeTransactions={incomeTransactionsForCurrentMonth}
            incomeAmount={incomeAmount}
            incomeDate={incomeDate}
            incomeKind={incomeKind}
            incomeNote={incomeNote}
            incomeMessage={incomeMessage}
            isSavingIncome={isSavingIncome}
            deletingTransactionId={deletingTransactionId}
            showIncomeForm={!isSharedView}
            coverage={!isSharedView ? personalContributionCoverage : undefined}
            onBalanceAmountChange={setBalanceAmount}
            onBalanceDateChange={setBalanceDate}
            onSaveBalance={saveBalanceSnapshot}
            onDeleteBalance={deleteBalanceSnapshot}
            onEditIncome={startEditingTransaction}
            onDeleteIncome={deleteTransaction}
            onIncomeAmountChange={setIncomeAmount}
            onIncomeDateChange={setIncomeDate}
            onIncomeKindChange={setIncomeKind}
            onIncomeNoteChange={setIncomeNote}
            onAddIncome={addIncome}
          />
          <ContributionCard
            accountName={selectedAccount?.name ?? viewCopy.label}
            showPlanning={isSharedView}
            amount={contributionAmount}
            date={contributionDate}
            kind={contributionKind}
            note={contributionNote}
            paidById={contributionPaidById}
            person={initialData.currentPerson}
            householdMembers={initialData.householdMembers}
            plans={isSharedView ? contributionPlanRows : []}
            planDrafts={contributionPlanDrafts}
            newPlanDrafts={newContributionPlanDrafts}
            planMessage={isSharedView ? contributionPlanMessage : ""}
            savingPlanId={savingContributionPlanId}
            plannedTotal={isSharedView ? plannedContributionTotal : 0}
            receivedTotal={monthTotals.contributionTotal}
            extraTotal={isSharedView ? extraContributionTotal : selectedExtraContributionTotal}
            taxReturnTotal={
              isSharedView
                ? taxReturnContributionTotal
                : selectedTaxReturnContributionTotal
            }
            remainingTotal={isSharedView ? remainingContributionTotal : 0}
            breakdown={isSharedView ? contributionBreakdown : []}
            coverage={isSharedView ? contributionCoverage : undefined}
            message={contributionMessage}
            isSaving={isSavingContribution}
            onAmountChange={setContributionAmount}
            onDateChange={setContributionDate}
            onKindChange={setContributionKind}
            onPaidByChange={setContributionPaidById}
            onNoteChange={setContributionNote}
            onPlanDraftChange={updateContributionPlanDraft}
            onNewPlanDraftChange={updateNewContributionPlanDraft}
            onPlanSave={saveContributionPlan}
            onPlanCreate={createContributionPlan}
            onSubmit={addContribution}
          />
        </section>

        <section
          className={cn(
            "finance-view gap-4 lg:hidden",
            activeSection === "month" ? "grid" : "hidden",
          )}
        >
          <MobileSectionHeader title="Maand" subtitle={monthLabel(currentMonth)} />
          <MonthNavigator
            currentMonth={currentMonth}
            monthOptions={monthOptions}
            onMonthChange={changeCurrentMonth}
          />
          <AllTransactionsCard
            currentMonth={currentMonth}
            rows={outgoingTransactionRows}
            freeSpaceTotal={heroBudget.remainingFreeBudget}
            fixedTotal={fixedTotalForCurrentMonth}
            deletingTransactionId={deletingTransactionId}
            onDeleteTransaction={deleteTransaction}
            onEditTransaction={startEditingTransaction}
            onOpenReceipt={setReceiptViewer}
          />
          <MonthSummaryCard
            description={viewCopy.monthDescription}
            currentMonth={currentMonth}
            totals={monthTotals}
            fixedTotal={fixedTotalForCurrentMonth}
            pacing={variableSpendPacing}
            showIncome={!isSharedView}
            monthMessage={monthMessage}
            onExportExcel={exportExcel}
            onExportPdf={(month) => void exportPdf(month)}
          />
          <ChartsPanel
            categoryRows={categoryRows}
            selectedSixMonthTrend={selectedSixMonthTrend}
            chartsReady={mobileChartsReady}
          />
          {isSharedView && (
            <PersonCostInsight
              people={initialData.people}
              personTotals={personTotals}
              categoryRows={categoryPersonRows}
              isSharedView={isSharedView}
            />
          )}
        </section>

        <div className="hidden gap-4 lg:grid lg:h-[calc(100dvh-2rem)] lg:min-h-0 lg:grid-cols-[220px_minmax(0,1fr)_320px] lg:overflow-hidden xl:grid-cols-[232px_minmax(0,1fr)_340px] 2xl:grid-cols-[240px_minmax(0,1fr)_360px]">
          <aside className="h-full min-h-0 self-start overflow-hidden">
            <AccountRail
              tabs={accountTabs}
              selectedAccountId={selectedAccountId}
              currentPerson={initialData.currentPerson}
              activeSection={activeSection}
              showPdtLink={showPdtNavLink}
              onSelect={(accountId) => {
                setSelectedAccountId(accountId);
                setQuickAccount(accountId);
              }}
              onSectionChange={setActiveSection}
            />
          </aside>

          <section
            data-finance-main
            className="scrollbar-hidden min-h-0 overflow-y-auto pr-1"
          >
            <div className="grid min-w-0 content-start gap-4 pb-4">
              {showOpeningBalanceReminder && (
                <div className="rounded-[14px] border border-[var(--border)] bg-[var(--accent-light)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                  Nieuwe maand — vergeet je openingssaldo niet in te voeren.
                </div>
              )}

              <section id="finance-dashboard">
                <DashboardHero
                  label={viewCopy.label}
                  value={dashboardPrimaryValue}
                  subtext={dashboardPrimarySubtext}
                  metrics={dashboardMetrics.slice(0, 3)}
                />
              </section>

              <CashflowTimelineCard
                points={cashflowTimeline}
                month={currentMonth}
                buffer={cashflowBuffer}
                startSnapshot={cashflowStartSnapshot}
                chartReady={chartsReady && isDesktopViewport === true}
                onBufferChange={(value) =>
                  updateCashflowBuffer(selectedAccountId, value)
                }
              />

              <MonthInsightsSection
                currentMonth={currentMonth}
                monthDescription={viewCopy.monthDescription}
                outgoingRows={outgoingTransactionRows}
                totals={monthTotals}
                showIncome={!isSharedView}
                freeSpaceTotal={heroBudget.remainingFreeBudget}
                fixedTotal={fixedTotalForCurrentMonth}
                variableSpendPacing={variableSpendPacing}
                monthMessage={monthMessage}
                categoryRows={categoryRows}
                selectedSixMonthTrend={selectedSixMonthTrend}
                chartsReady={chartsReady && isDesktopViewport === true}
                monthOptions={monthOptions}
                deletingTransactionId={deletingTransactionId}
                onMonthChange={changeCurrentMonth}
                onExportExcel={exportExcel}
                onExportPdf={(month) => void exportPdf(month)}
                onDeleteTransaction={deleteTransaction}
                onEditTransaction={startEditingTransaction}
                onOpenReceipt={setReceiptViewer}
              />

              {isSharedView && (
                <PersonCostInsight
                  people={initialData.people}
                  personTotals={personTotals}
                  categoryRows={categoryPersonRows}
                  isSharedView={isSharedView}
                />
              )}

              <section id="finance-fixed" className="scroll-mt-4 grid gap-4">
                <FixedExpenseAgenda
                  items={fixedAgendaItems}
                  transactions={selectedTransactions}
                  plannedContributions={isSharedView ? contributionPlanRows : []}
                  currentMonth={currentMonth}
                  message={fixedMessage}
                  highlightedId={highlightedFixedInstanceId}
                  skippingId={skippingFixedInstanceId}
                  onSkip={skipFixedExpense}
                />
                <FixedExpenseManager
                  expenses={selectedRecurringExpenses}
                  categories={fixedCategories}
                  labels={labels}
                  accountName={selectedAccount?.name ?? viewCopy.label}
                  name={recurringName}
                  amount={recurringAmount}
                  billingDay={recurringBillingDay}
                  startsOn={recurringStartsOn}
                  category={recurringCategory}
                  editingId={editingRecurringId}
                  highlightedId={highlightedRecurringId}
                  message={manageMessage}
                  isSaving={isSavingRecurring}
                  onNameChange={setRecurringName}
                  onAmountChange={setRecurringAmount}
                  onBillingDayChange={setRecurringBillingDay}
                  onStartsOnChange={setRecurringStartsOn}
                  onCategoryChange={setRecurringCategory}
                  onSave={saveRecurringExpense}
                  onEdit={startEditingRecurring}
                  onDelete={deleteRecurringExpense}
                  onCancel={resetRecurringForm}
                />
              </section>

              <section id="finance-vermogen" className="scroll-mt-4 grid gap-4">
                <SavingsCard
                  accountName={
                    isSharedView
                      ? "Gezamenlijke spaarrekening"
                      : `${initialData.currentPerson} spaarrekening`
                  }
                  snapshot={latestSavingsSnapshot}
                  currentBalance={currentSavingsBalance}
                  depositTotal={savingsDepositTotalToDate}
                  suggestionAmount={savingsSuggestionAmount}
                  startAmount={savingsStartAmount}
                  startDate={savingsStartDate}
                  depositAmount={savingsDepositAmount}
                  depositDate={savingsDepositDate}
                  message={savingsMessage}
                  isSavingSnapshot={isSavingSavingsSnapshot}
                  isSavingDeposit={isSavingSavingsDeposit}
                  onStartAmountChange={setSavingsStartAmount}
                  onStartDateChange={setSavingsStartDate}
                  onDepositAmountChange={setSavingsDepositAmount}
                  onDepositDateChange={setSavingsDepositDate}
                  onSaveStartBalance={saveSavingsSnapshot}
                  onAddDeposit={addSavingsDeposit}
                />
                {showInvestmentSection && (
                  <InvestmentSection
                    degiroPositions={degiroPositions}
                    degiroName={degiroName}
                    degiroTicker={degiroTicker}
                    degiroAmount={degiroAmount}
                    cryptoPositions={cryptoPositions}
                    cryptoCoinName={cryptoCoinName}
                    cryptoCoinId={cryptoCoinId}
                    cryptoTicker={cryptoTicker}
                    cryptoAmount={cryptoAmount}
                    message={investmentMessage}
                    isSavingDegiroPosition={isSavingDegiroPosition}
                    isSavingCryptoPosition={isSavingCryptoPosition}
                    deletingDegiroPositionId={deletingDegiroPositionId}
                    deletingCryptoPositionId={deletingCryptoPositionId}
                    onDegiroNameChange={setDegiroName}
                    onDegiroTickerChange={setDegiroTicker}
                    onDegiroAmountChange={setDegiroAmount}
                    onAddDegiroPosition={addDegiroPosition}
                    onDeleteDegiroPosition={deleteDegiroPosition}
                    onCryptoCoinNameChange={setCryptoCoinName}
                    onCryptoCoinIdChange={setCryptoCoinId}
                    onCryptoTickerChange={setCryptoTicker}
                    onCryptoAmountChange={setCryptoAmount}
                    onAddCryptoPosition={addCryptoPosition}
                    onDeleteCryptoPosition={deleteCryptoPosition}
                  />
                )}
              </section>
            </div>
          </section>

          <aside
            data-finance-context
            className="scrollbar-hidden grid h-full min-h-0 content-start gap-4 overflow-y-auto pr-1"
          >
            <AccountBalanceCard
              accountName={selectedAccount?.name ?? viewCopy.label}
              snapshot={latestBalanceSnapshot}
              labels={labels}
              balanceAmount={balanceAmount}
              balanceDate={balanceDate}
              balanceMessage={balanceMessage}
              isSavingBalance={isSavingBalance}
              incomeTransactions={incomeTransactionsForCurrentMonth}
              incomeAmount={incomeAmount}
              incomeDate={incomeDate}
              incomeKind={incomeKind}
              incomeNote={incomeNote}
              incomeMessage={incomeMessage}
              isSavingIncome={isSavingIncome}
              deletingTransactionId={deletingTransactionId}
              showIncomeForm={!isSharedView}
              coverage={!isSharedView ? personalContributionCoverage : undefined}
              onBalanceAmountChange={setBalanceAmount}
              onBalanceDateChange={setBalanceDate}
              onSaveBalance={saveBalanceSnapshot}
              onDeleteBalance={deleteBalanceSnapshot}
              onEditIncome={startEditingTransaction}
              onDeleteIncome={deleteTransaction}
              onIncomeAmountChange={setIncomeAmount}
              onIncomeDateChange={setIncomeDate}
              onIncomeKindChange={setIncomeKind}
              onIncomeNoteChange={setIncomeNote}
              onAddIncome={addIncome}
            />

            <section id="finance-input" className="scroll-mt-4">
              <QuickEntryCard
                title={viewCopy.quickTitle}
                amount={quickAmount}
                account={quickAccount}
                date={quickDate}
                note={quickNote}
                category={activeQuickCategory}
                paidById={quickPaidById}
                householdMembers={initialData.householdMembers}
                onAmountChange={setQuickAmount}
                onAccountChange={setQuickAccount}
                onDateChange={setQuickDate}
                onNoteChange={setQuickNote}
                onCategoryChange={setQuickCategory}
                onPaidByChange={setQuickPaidById}
                isScanningReceipt={isScanningReceipt}
                scanMessage={scanMessage}
                receiptDraft={receiptDraft}
                onScanReceipt={scanReceipt}
                onDismissReceiptDraft={dismissReceiptDraft}
                variableCategories={variableCategories}
                accounts={initialData.accounts}
                categoryUsageCounts={categoryUsageCounts}
                customCategoryName={customCategoryName}
                categoryMessage={categoryMessage}
                isSavingCategory={isSavingCategory}
                categoryOperationId={categoryOperationId}
                onCustomCategoryNameChange={setCustomCategoryName}
                onAddCategory={addVariableCategory}
                onRenameCategory={renameVariableCategory}
                onDeleteCategory={deleteVariableCategory}
                onSubmit={addVariableExpense}
              />
            </section>

            <ContributionCard
              accountName={selectedAccount?.name ?? viewCopy.label}
              showPlanning={isSharedView}
              amount={contributionAmount}
              date={contributionDate}
              kind={contributionKind}
              note={contributionNote}
              paidById={contributionPaidById}
              person={initialData.currentPerson}
              householdMembers={initialData.householdMembers}
              plans={isSharedView ? contributionPlanRows : []}
              planDrafts={contributionPlanDrafts}
              newPlanDrafts={newContributionPlanDrafts}
              planMessage={isSharedView ? contributionPlanMessage : ""}
              savingPlanId={savingContributionPlanId}
              plannedTotal={isSharedView ? plannedContributionTotal : 0}
              receivedTotal={monthTotals.contributionTotal}
              extraTotal={isSharedView ? extraContributionTotal : selectedExtraContributionTotal}
              taxReturnTotal={
                isSharedView
                  ? taxReturnContributionTotal
                  : selectedTaxReturnContributionTotal
              }
              remainingTotal={isSharedView ? remainingContributionTotal : 0}
              breakdown={isSharedView ? contributionBreakdown : []}
              coverage={isSharedView ? contributionCoverage : undefined}
              message={contributionMessage}
              isSaving={isSavingContribution}
              onAmountChange={setContributionAmount}
              onDateChange={setContributionDate}
              onKindChange={setContributionKind}
              onPaidByChange={setContributionPaidById}
              onNoteChange={setContributionNote}
              onPlanDraftChange={updateContributionPlanDraft}
              onNewPlanDraftChange={updateNewContributionPlanDraft}
              onPlanSave={saveContributionPlan}
              onPlanCreate={createContributionPlan}
              onSubmit={addContribution}
            />

            <BankAppsCard />
          </aside>
        </div>
      </div>
      {editingTransaction && (
        <TransactionEditDialog
          transaction={editingTransaction}
          categories={categories}
          variableCategories={variableCategories}
          labels={labels}
          householdMembers={initialData.householdMembers}
          amount={editAmount}
          date={editDate}
          note={editNote}
          category={editCategory}
          paidById={editPaidById}
          contributionKind={editContributionKind}
          message={editMessage}
          isSaving={isSavingTransactionEdit}
          onAmountChange={setEditAmount}
          onDateChange={setEditDate}
          onNoteChange={setEditNote}
          onCategoryChange={setEditCategory}
          onPaidByChange={setEditPaidById}
          onContributionKindChange={setEditContributionKind}
          onCreateCategory={createVariableCategory}
          onClose={closeTransactionEditor}
          onSave={saveEditedTransaction}
        />
      )}
      {receiptViewer && (
        <ReceiptViewer
          receipt={receiptViewer}
          onClose={() => setReceiptViewer(null)}
        />
      )}
      {isExportDialogOpen && (
        <ExportDialog
          currentMonth={currentMonth}
          monthOptions={monthOptions}
          transactions={selectedTransactions}
          onClose={() => setIsExportDialogOpen(false)}
          onExportExcel={exportExcel}
          onExportPdf={exportPdf}
          onDownloadReceipts={downloadReceiptZip}
          onExportExcelRange={exportExcelRange}
          onDownloadReceiptRange={downloadReceiptZipRange}
        />
      )}
    </main>
  );
}

type FixedAgendaState =
  | "processed"
  | "autoProcessed"
  | "changed"
  | "skipped"
  | "overdue"
  | "today"
  | "upcoming";

type FixedAgendaItem = {
  id: string;
  recurringExpenseId: string;
  name: string;
  categoryName: string;
  categoryColor: string;
  amount: number;
  date: string;
  day: number;
  state: FixedAgendaState;
  canSkip: boolean;
  note?: string;
};

type CalendarTooltipItem = {
  id: string;
  name: string;
  amount: number;
  color: string;
  kind: "fixed" | "contribution";
};

type OutgoingTransactionRow = {
  id: string;
  date: string;
  title: string;
  subtitle: string;
  amount: number;
  signedAmount: number;
  kind: "fixed" | "variable" | "contribution" | "income" | "sparen";
  color: string;
  receiptUrl?: string;
  state?: FixedAgendaState;
  transaction?: Transaction;
  isExpected?: boolean;
};

function MobileBottomNav({
  activeSection,
  onSectionChange,
}: {
  activeSection: ActiveSection;
  onSectionChange: (section: ActiveSection) => void;
}) {
  const navItems = sectionNavItems();
  const mobileOrder: ActiveSection[] = [
    "dashboard",
    "fixed",
    "input",
    "vermogen",
    "month",
  ];
  const items = mobileOrder.flatMap((section) =>
    navItems.filter((item) => item.id === section),
  );

  return (
    <nav className="finance-bottom-nav fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 items-start border-t border-[var(--border)] lg:hidden">
      {items.map((item) => {
        const isActive = activeSection === item.id;
        const isPrimaryAction = item.id === "input";
        const Icon = item.icon;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSectionChange(item.id)}
            className={cn(
              "min-w-0 rounded-[14px] text-[12px] font-semibold leading-none",
              isActive
                ? "text-[var(--accent)]"
                : "text-[var(--text-muted)]",
            )}
            aria-label={item.label}
          >
            <span
              className={cn(
                "flex shrink-0 items-center justify-center",
                isPrimaryAction &&
                  "rounded-full bg-[#6366F1] p-2 text-white shadow-[0_0_18px_rgba(99,102,241,0.35)]",
              )}
            >
              <Icon
                className={cn(
                  "shrink-0",
                  isPrimaryAction ? "h-6 w-6" : "h-5 w-5",
                )}
              />
            </span>
            <span className="max-w-full whitespace-nowrap">{item.mobileLabel}</span>
          </button>
        );
      })}
    </nav>
  );
}

function MobileSectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
          {title}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{subtitle}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function AccountPills({
  tabs,
  selectedAccountId,
  onSelect,
}: {
  tabs: Array<{ id: string; label: string; description: string }>;
  selectedAccountId: string;
  onSelect: (accountId: string) => void;
}) {
  return (
    <div className="flex w-full max-w-full gap-1 overflow-hidden rounded-[var(--radius-chip)] bg-[var(--bg-surface)] p-1">
      {tabs.map((tab) => {
        const isActive = selectedAccountId === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={cn(
              "min-h-11 min-w-0 flex-1 rounded-[var(--radius-chip)] px-2 py-1.5 text-center text-xs font-medium sm:px-[18px] sm:text-sm",
              isActive
                ? "bg-[var(--accent-light)] text-[var(--accent)]"
                : "text-[var(--text-secondary)] hover:bg-white/[0.04]",
            )}
          >
            <span className="block whitespace-nowrap">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function DashboardHero({
  label,
  value,
  subtext,
  metrics,
  mobile = false,
}: {
  label: string;
  value: string;
  subtext: string;
  metrics: DashboardMetric[];
  mobile?: boolean;
}) {
  return (
    <section className="finance-card rounded-[var(--radius-card)] border border-[var(--border)] bg-[linear-gradient(135deg,#191924,#13131C)] p-3 shadow-[0_0_80px_rgba(99,102,241,0.07)_inset] sm:p-5">
      <div className={cn("grid gap-3 sm:gap-5", mobile ? "text-center" : "lg:grid-cols-[1fr_auto] lg:items-end")}>
        <div>
          <p className="text-xs font-medium text-[var(--text-secondary)] sm:text-sm lg:text-xs">
            {label}
          </p>
          <p
            className={cn(
              "mt-2 font-bold tracking-normal text-[var(--text-primary)]",
              mobile ? "text-[36px] leading-none sm:text-[44px]" : "text-[32px]",
            )}
          >
            {value}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)] sm:text-[13px]">
            {subtext}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-[12px] border border-[var(--border)] bg-black/10 p-2.5 text-left sm:rounded-[14px] sm:p-3"
            >
              <div className="mb-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-light)] text-[var(--accent)] sm:mb-2 sm:h-8 sm:w-8">
                {metric.icon}
              </div>
              <p
                className={cn(
                  "text-[17px] font-semibold leading-5 text-[var(--text-primary)] sm:text-lg",
                  metric.valueTone === "emerald" && "text-[var(--positive)]",
                  metric.valueTone === "red" && "text-[var(--negative)]",
                )}
              >
                {metric.value}
              </p>
              <p className="mt-1 whitespace-nowrap text-[11px] font-medium leading-[14px] text-[var(--text-secondary)] sm:text-xs">
                {metric.label}
              </p>
              {metric.detail && (
                <p className="mt-1 line-clamp-2 text-[11px] leading-[14px] text-[var(--text-muted)] sm:text-xs sm:leading-4">
                  {metric.detail}
                </p>
              )}
              {typeof metric.progress === "number" && metric.progressTone && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10 sm:mt-3">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      metric.progressTone === "emerald" && "bg-[var(--positive)]",
                      metric.progressTone === "orange" && "bg-[#F59E0B]",
                      metric.progressTone === "red" && "bg-[var(--negative)]",
                    )}
                    style={{ width: `${metric.progress}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CashflowTimelineCard({
  points,
  month,
  buffer,
  startSnapshot,
  chartReady = true,
  onBufferChange,
  compact = false,
}: {
  points: CashflowPoint[];
  month: string;
  buffer: number;
  startSnapshot?: CashflowStartSnapshot;
  chartReady?: boolean;
  onBufferChange: (value: number) => void;
  compact?: boolean;
}) {
  const insight = cashflowInsight(points, buffer);
  const hasCashflowPoints = points.length > 0;

  return (
    <Card className="finance-card">
      <CardHeader
        className={cn(
          "pb-3",
          compact && "px-3 pb-2 pt-3 text-left sm:px-5 sm:pt-5",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Cashflow</CardTitle>
            <CardDescription className={cn(compact && "leading-4")}>
              Lopend saldo deze maand
              <span className="mt-1 block text-[11px] text-[var(--text-muted)]">
                {startSnapshot
                  ? `Saldo op ${formatCashflowStartDate(startSnapshot.snapshotDate)}: ${currency(startSnapshot.balance)}`
                  : "Geen openingssaldo ingevoerd"}
              </span>
            </CardDescription>
          </div>
          <div className={cn("w-24", compact && "w-20 sm:w-24")}>
            <label className="grid gap-1 text-[11px] font-medium uppercase text-[var(--text-muted)]">
              Buffer
              <Input
                inputMode="decimal"
                value={String(buffer)}
                className="h-10 rounded-[10px] px-2 text-right text-xs"
                onChange={(event) => {
                  const value = Number(event.target.value.replace(",", "."));
                  onBufferChange(Number.isFinite(value) && value >= 0 ? value : 0);
                }}
              />
            </label>
          </div>
        </div>
      </CardHeader>
      <CardContent className={cn("space-y-3", compact && "space-y-2 px-3 pb-3 pt-0 sm:p-5 sm:pt-0")}>
        <div className={cn("h-40", compact && "h-28 min-[390px]:h-32 sm:h-40")}>
          {chartReady ? (
            <CashflowRechartsChart
              points={points}
              month={month}
              buffer={buffer}
              emptyMessage="Voer een openingssaldo in om de cashflow te starten."
            />
          ) : (
            <div className="h-full rounded-[12px] border border-dashed border-[var(--border)] bg-black/10" />
          )}
        </div>
        {hasCashflowPoints && (
          <>
            <CashflowLegend />
            <p
              className={cn(
                "rounded-[12px] border border-[var(--border)] bg-[var(--bg-surface)] p-3 text-sm leading-5 text-[var(--text-secondary)]",
                compact && "line-clamp-2 p-2 text-xs leading-4 sm:p-3 sm:text-sm sm:leading-5",
              )}
            >
              {insight.text}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CashflowLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-secondary)]">
      <CashflowLegendItem color="#10B981" label="Ruim boven buffer" />
      <CashflowLegendItem color="#F59E0B" label="Binnen buffer" />
      <CashflowLegendItem color="#EF4444" label="Onder buffer" />
    </div>
  );
}

function CashflowLegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

function CashflowRechartsChart({
  points,
  month,
  buffer,
  emptyMessage = "Nog geen cashflowpunten.",
}: {
  points: CashflowPoint[];
  month: string;
  buffer: number;
  emptyMessage?: string;
}) {
  if (!points.length) {
    return (
      <div className="flex h-full items-center justify-center rounded-[12px] border border-dashed border-[var(--border)] bg-black/10 text-xs text-[var(--text-muted)]">
        {emptyMessage}
      </div>
    );
  }

  const chart = buildCashflowChartModel(points, buffer, month);

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
      <LineChart
        data={chart.data}
        margin={{ top: 12, right: 8, bottom: 0, left: 0 }}
      >
        <CartesianGrid
          vertical={false}
          stroke="rgba(161,161,170,0.18)"
          strokeDasharray="3 3"
        />
        <XAxis
          dataKey="day"
          type="number"
          domain={chart.xDomain}
          ticks={chart.xTicks}
          axisLine={false}
          tickLine={false}
          tick={{ fill: "#A1A1AA", fontSize: 11 }}
          tickFormatter={(value) =>
            formatCashflowDateTick(month, Number(value))
          }
        />
        <YAxis
          type="number"
          domain={chart.yDomain}
          ticks={chart.yTicks}
          width={54}
          axisLine={false}
          tickLine={false}
          tick={{ fill: "#A1A1AA", fontSize: 11 }}
          tickFormatter={(value) => formatCashflowAxisValue(Number(value))}
        />
        {chart.showOrangeZone && (
          <ReferenceArea
            y1={chart.orangeZone[0]}
            y2={chart.orangeZone[1]}
            fill="#F59E0B"
            fillOpacity={0.1}
            ifOverflow="extendDomain"
          />
        )}
        {chart.showRedZone && (
          <ReferenceArea
            y1={chart.redZone[0]}
            y2={chart.redZone[1]}
            fill="#EF4444"
            fillOpacity={0.1}
            ifOverflow="extendDomain"
          />
        )}
        <ReferenceLine
          y={buffer}
          stroke="#6366F1"
          strokeDasharray="4 4"
          strokeWidth={1.5}
          ifOverflow="extendDomain"
          label={{
            value: "Buffer",
            position: "right",
            fill: "#6366F1",
            fontSize: 11,
          }}
        />
        {typeof chart.todayLineDay === "number" && (
          <ReferenceLine
            x={chart.todayLineDay}
            stroke="rgba(255,255,255,0.22)"
            strokeDasharray="3 3"
            strokeWidth={1}
            ifOverflow="visible"
            label={{
              value: "vandaag",
              position: "top",
              fill: "#A1A1AA",
              fontSize: 10,
            }}
          />
        )}
        {chart.segments.length > 0 ? (
          chart.segments.map((segment) => (
            <Line
              key={segment.id}
              data={segment.data}
              type="linear"
              dataKey="balance"
              stroke={segment.color}
              strokeWidth={3}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              strokeLinecap="round"
              connectNulls
            />
          ))
        ) : (
          <Line
            data={chart.data}
            type="linear"
            dataKey="balance"
            stroke={cashflowLineColor(points[0].balance, buffer)}
            strokeWidth={3}
            dot={{ r: 4 }}
            activeDot={false}
            isAnimationActive={false}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

function MonthNavigator({
  currentMonth,
  monthOptions,
  onMonthChange,
  compact = false,
}: {
  currentMonth: string;
  monthOptions: MonthOption[];
  onMonthChange: (month: string) => void;
  compact?: boolean;
}) {
  const newestMonth = monthOptions[0]?.value ?? currentMonth;
  const oldestMonth = monthOptions.at(-1)?.value ?? currentMonth;
  const previousMonth = addIsoMonths(currentMonth, -1);
  const nextMonth = addIsoMonths(currentMonth, 1);
  const canGoPrevious = previousMonth >= oldestMonth;
  const canGoNext = nextMonth <= newestMonth;
  const groupedMonths = groupMonthOptionsByYear(monthOptions);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const [isDesktopPopoverOpen, setIsDesktopPopoverOpen] = useState(false);
  const desktopQuickMonths = [
    { label: "Deze maand", value: newestMonth },
    { label: "Vorige maand", value: addIsoMonths(newestMonth, -1) },
  ].filter((item) => monthOptions.some((month) => month.value === item.value));

  function selectMonth(month: string) {
    onMonthChange(month);
    setIsMobileSheetOpen(false);
    setIsDesktopPopoverOpen(false);
  }

  return (
    <>
      <div
        className={cn(
          "relative flex items-center gap-2 rounded-[var(--radius-chip)] border border-[var(--border)] bg-[var(--bg-surface)] p-1",
          compact ? "w-fit" : "w-full",
        )}
      >
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={!canGoPrevious}
          onClick={() => onMonthChange(previousMonth)}
          title="Vorige maand"
          className="h-8 w-8 shrink-0 text-[var(--text-secondary)] disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <button
          type="button"
          onClick={() => setIsMobileSheetOpen(true)}
          className={cn(
            "h-8 min-w-0 flex-1 rounded-[var(--radius-chip)] px-3 text-center text-sm font-semibold text-[var(--text-primary)] transition hover:bg-white/[0.04] lg:hidden",
            compact && "w-[9.5rem] flex-none",
          )}
        >
          {monthLabel(currentMonth)}
        </button>

        <button
          type="button"
          onClick={() => setIsDesktopPopoverOpen((open) => !open)}
          className={cn(
            "hidden h-8 min-w-0 rounded-[var(--radius-chip)] px-3 text-center text-sm font-semibold text-[var(--text-primary)] transition hover:bg-white/[0.04] lg:block",
            compact ? "w-[9.5rem]" : "flex-1",
          )}
          aria-expanded={isDesktopPopoverOpen}
          aria-label="Maand kiezen"
        >
          {monthLabel(currentMonth)}
        </button>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={!canGoNext}
          onClick={() => onMonthChange(nextMonth)}
          title="Volgende maand"
          className="h-8 w-8 shrink-0 text-[var(--text-secondary)] disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        {isDesktopPopoverOpen && (
          <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 hidden w-72 overflow-hidden rounded-[18px] border border-[var(--border-strong)] bg-[var(--bg-card)] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.42)] lg:block">
            <div className="grid gap-1 border-b border-[var(--border)] pb-3">
              {desktopQuickMonths.map((month) => (
                <button
                  key={month.label}
                  type="button"
                  onClick={() => selectMonth(month.value)}
                  className={cn(
                    "rounded-[10px] px-3 py-2 text-left text-sm font-medium text-[var(--text-secondary)] transition hover:bg-white/[0.04]",
                    month.value === currentMonth &&
                      "bg-[var(--accent-light)] text-[var(--accent)]",
                  )}
                >
                  {month.label}
                </button>
              ))}
            </div>
            <div className="mt-3 max-h-80 space-y-4 overflow-y-auto pr-1 no-scrollbar">
              {groupedMonths.map((group) => (
                <div key={group.year}>
                  <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {group.year}
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {group.months.map((month) => (
                      <button
                        key={month.value}
                        type="button"
                        onClick={() => selectMonth(month.value)}
                        className={cn(
                          "rounded-[10px] px-3 py-2 text-left text-xs font-medium text-[var(--text-secondary)] transition hover:bg-white/[0.04]",
                          month.value === currentMonth &&
                            "bg-[var(--accent-light)] text-[var(--accent)]",
                        )}
                      >
                        {month.label.replace(` ${group.year}`, "")}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {isMobileSheetOpen && (
        <div className="fixed inset-0 z-[70] bg-black/65 backdrop-blur-sm lg:hidden">
          <button
            type="button"
            aria-label="Maandkiezer sluiten"
            className="absolute inset-0 h-full w-full cursor-default"
            onClick={() => setIsMobileSheetOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-hidden rounded-t-[28px] border border-[var(--border-strong)] bg-[var(--bg-card)] shadow-[0_-24px_80px_rgba(0,0,0,0.44)]">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
              <div>
                <p className="text-base font-semibold text-[var(--text-primary)]">
                  Maand kiezen
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Bekijk eerdere maanden terug.
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setIsMobileSheetOpen(false)}
                title="Sluiten"
                className="h-9 w-9 text-[var(--text-secondary)]"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="max-h-[calc(78vh-72px)] space-y-5 overflow-y-auto px-5 py-4 no-scrollbar">
              {groupedMonths.map((group) => (
                <div key={group.year}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {group.year}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {group.months.map((month) => (
                      <button
                        key={month.value}
                        type="button"
                        onClick={() => selectMonth(month.value)}
                        className={cn(
                          "rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-3 text-sm font-medium text-[var(--text-secondary)] transition active:scale-[0.98]",
                          month.value === currentMonth &&
                            "border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent)]",
                        )}
                      >
                        {month.label.replace(` ${group.year}`, "")}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AccountRail({
  tabs,
  selectedAccountId,
  currentPerson,
  activeSection,
  showPdtLink,
  onSelect,
  onSectionChange,
}: {
  tabs: Array<{ id: string; label: string; description: string }>;
  selectedAccountId: string;
  currentPerson: string;
  activeSection: ActiveSection;
  showPdtLink: boolean;
  onSelect: (accountId: string) => void;
  onSectionChange: (section: ActiveSection) => void;
}) {
  const items = sectionNavItems();

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--bg-surface)]">
      <CardContent className="scrollbar-hidden flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-3">
        <div className="px-2 pt-2">
          <p className="text-xl font-semibold text-[var(--text-primary)]">
            Finance
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Familie Wijnands
          </p>
        </div>

        <div className="grid gap-1">
          <p className="px-2 text-xs text-[var(--text-muted)]">
            Rekening
          </p>
          {tabs.map((tab) => {
            const isActive = selectedAccountId === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelect(tab.id)}
                className={cn(
                  "rounded-[8px] px-3 py-2 text-left",
                  isActive
                    ? "bg-[var(--accent-light)] text-[var(--accent)]"
                    : "text-[var(--text-secondary)] hover:bg-white/[0.04]",
                )}
              >
                <span className="block text-sm font-semibold">{tab.label}</span>
                <span className="mt-0.5 block truncate text-xs opacity-70">
                  {tab.description}
                </span>
              </button>
            );
          })}
        </div>

        <nav className="grid gap-1 border-t border-[var(--border)] pt-4">
          {items.map((item) => {
            const isActive = activeSection === item.id;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSectionChange(item.id);
                  window.requestAnimationFrame(() => {
                    scrollToFinanceSection(item.id);
                  });
                }}
                className={cn(
                  "flex items-center gap-3 rounded-[8px] px-3 py-2 text-sm font-medium",
                  isActive
                    ? "bg-[var(--accent-light)] text-[var(--accent)]"
                    : "text-[var(--text-secondary)] hover:bg-white/[0.04]",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
          {showPdtLink && (
            <a
              href="https://app.portfoliodividendtracker.com/login"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-[8px] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-white/[0.04]"
            >
              <TrendingUp className="h-4 w-4" />
              PDT
            </a>
          )}
          <a
            href="/instellingen"
            className="flex items-center gap-3 rounded-[8px] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-white/[0.04]"
          >
            <Settings className="h-4 w-4" />
            Instellingen
          </a>
        </nav>

        <div className="mt-auto rounded-[12px] border border-[var(--border)] bg-black/10 p-3">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {currentPerson}
          </p>
          <form action="/auth/sign-out" method="post" className="mt-2">
            <Button type="submit" size="sm" variant="ghost" className="h-8 px-0 text-[var(--text-secondary)] hover:bg-transparent hover:text-[var(--text-primary)]">
              <LogOut className="h-4 w-4" />
              Uitloggen
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

function MonthTransactionsCard({
  title,
  description,
  currentMonth,
  rows,
  selectedAccountId,
  monthMessage,
  deletingTransactionId,
  onDeleteTransaction,
  onEditTransaction,
  onOpenReceipt,
  compact = false,
  className,
}: {
  title: string;
  description: string;
  currentMonth: string;
  rows: OutgoingTransactionRow[];
  selectedAccountId: string;
  monthMessage: string;
  deletingTransactionId: string | null;
  onDeleteTransaction: (transaction: Transaction) => void;
  onEditTransaction: (transaction: Transaction) => void;
  onOpenReceipt: (receipt: ReceiptViewerState) => void;
  compact?: boolean;
  className?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleRows = compact && !isExpanded ? rows.slice(0, 6) : rows;
  const hiddenCount = rows.length - visibleRows.length;
  const cardTitle = compact ? "Maandoverzicht" : title;

  return (
    <Card
      className={cn(
        "finance-card overflow-hidden",
        compact ? "max-w-none" : "max-w-[640px]",
        className,
      )}
    >
      <CardHeader
        className={cn(
          "grid gap-3 pb-3 sm:grid-cols-[1fr_auto] sm:items-start",
          compact && "sm:grid-cols-1 2xl:grid-cols-[1fr_auto]",
        )}
      >
        <div className="min-w-0">
          <CardTitle>{cardTitle}</CardTitle>
          <CardDescription className="max-w-[34rem]">{description}</CardDescription>
        </div>
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <Badge className="hidden border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] sm:inline-flex">
            {monthLabel(currentMonth)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {monthMessage && (
          <p className="mx-4 mb-3 rounded-[12px] border border-[var(--border)] bg-[var(--bg-surface)] p-3 text-sm text-[var(--text-secondary)] sm:mx-5">
            {monthMessage}
          </p>
        )}

        {rows.length > 0 ? (
          <div className="divide-y divide-[var(--border)]">
            {visibleRows.map((row) => {
              const transaction = row.transaction;
              const isDeleting =
                Boolean(transaction) && deletingTransactionId === transaction?.id;
              const isPositive = row.signedAmount >= 0;
              const isEditable = Boolean(transaction);

              return (
                <div
                  key={row.id}
                  role={isEditable ? "button" : undefined}
                  tabIndex={isEditable ? 0 : undefined}
                  onClick={() => {
                    if (transaction) {
                      onEditTransaction(transaction);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (transaction && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      onEditTransaction(transaction);
                    }
                  }}
                  className={cn(
                    "group/transaction grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 transition sm:px-5",
                    isEditable && "desktop-row-hover cursor-pointer",
                    compact ? "py-2.5" : "py-3",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)]",
                        isPositive
                          ? "border-emerald-400/20 bg-[var(--positive-light)] text-[var(--positive)]"
                          : "text-[var(--text-secondary)]",
                      )}
                    >
                      {isPositive ? (
                        <ArrowDownToLine className="h-4 w-4" />
                      ) : (
                        <ReceiptText className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                        {row.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                        {row.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="flex min-w-fit items-center gap-2 text-right">
                    {row.receiptUrl && (
                      <ReceiptAttachment
                        receiptUrl={row.receiptUrl}
                        title={`${row.title} · ${row.date}`}
                        onOpen={onOpenReceipt}
                      />
                    )}
                    <div>
                      <p
                        className={cn(
                          "text-[15px] font-semibold",
                          isPositive
                            ? "text-[var(--positive)]"
                            : "text-[var(--negative)]",
                        )}
                      >
                        {isPositive ? "+" : "-"}
                        {preciseCurrency(Math.abs(row.signedAmount))}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                        {transactionRowMetaLabel(row, selectedAccountId)}
                      </p>
                    </div>
                    {transaction && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Verwijder transactie"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteTransaction(transaction);
                        }}
                        disabled={isDeleting}
                        className="h-8 w-8 shrink-0 text-[var(--text-muted)] opacity-0 transition hover:text-[var(--negative)] focus-visible:opacity-100 group-hover/transaction:opacity-100 group-focus-within/transaction:opacity-100 active:opacity-100"
                      >
                        {isDeleting ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            {hiddenCount > 0 && (
              <div className="px-4 py-3 sm:px-5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-0 text-xs text-[var(--text-muted)] hover:bg-transparent hover:text-[var(--text-primary)]"
                  onClick={() => setIsExpanded(true)}
                >
                  Plus {hiddenCount} extra transacties tonen
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div
            className={cn(
              "m-4 rounded-[14px] border border-dashed border-[var(--border)] bg-[var(--bg-surface)] text-sm text-[var(--text-secondary)] sm:m-5",
              compact ? "p-3" : "p-4",
            )}
          >
            Nog geen transacties in {monthLabel(currentMonth)}.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MonthSummaryCard({
  className,
  description,
  currentMonth,
  totals,
  fixedTotal,
  pacing,
  showIncome,
  monthMessage,
  onExportExcel,
  onExportPdf,
}: {
  className?: string;
  description: string;
  currentMonth: string;
  totals: ReturnType<typeof totalsForMonth>;
  fixedTotal: number;
  pacing: VariableSpendPacingResult;
  showIncome: boolean;
  monthMessage: string;
  onExportExcel: (month: string) => void;
  onExportPdf: (month: string) => void;
}) {
  const maxPacingValue = Math.max(
    pacing.estimatedVariableTotal,
    pacing.currentVariableTotal,
    pacing.previousMonthTotalToDate,
    1,
  );
  const actualPacingColor =
    pacing.currentVariableTotal <= pacing.estimatedVariableTotal
      ? "#10B981"
      : "#EF4444";
  const pacingChartRows = [
    {
      label: "Inschatting",
      value: pacing.estimatedVariableTotal,
      fill: "#64748B",
    },
    {
      label: "Werkelijk",
      value: pacing.currentVariableTotal,
      fill: actualPacingColor,
    },
    {
      label: "Vorige maand",
      value: pacing.previousMonthTotalToDate,
      fill: "#71717A",
    },
  ];
  const summaryRows = [
    {
      label: "Uitgaven",
      value: fixedTotal + totals.variableTotal + totals.savingsTotal,
      tone: "red" as const,
      detail: totals.savingsTotal > 0
        ? "Vaste lasten + variabel + sparen"
        : "Vaste lasten + variabel",
    },
    {
      label: "Stortingen",
      value: totals.contributionTotal,
      tone: "emerald" as const,
      detail: showIncome ? "Op deze rekening" : "Op de gezamenlijke rekening",
    },
    ...(showIncome
      ? [
          {
            label: "Inkomen",
            value: totals.incomeTotal,
            tone: "emerald" as const,
            detail: "Salaris en extra inkomsten",
          },
        ]
      : []),
  ];

  return (
    <Card className={cn("finance-card", className)}>
      <CardHeader className="grid gap-3 pb-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="min-w-0">
          <CardTitle>Maandoverzicht</CardTitle>
          <CardDescription className="max-w-[34rem]">{description}</CardDescription>
        </div>
        <Badge className="w-fit border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
          {monthLabel(currentMonth)}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {monthMessage && (
          <p className="rounded-[12px] border border-[var(--border)] bg-[var(--bg-surface)] p-3 text-sm text-[var(--text-secondary)]">
            {monthMessage}
          </p>
        )}

        <div
          className={cn(
            "grid gap-2",
            showIncome ? "sm:grid-cols-3" : "sm:grid-cols-2",
          )}
        >
          {summaryRows.map((row) => (
            <div
              key={row.label}
              className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] p-3"
            >
              <p className="text-[11px] font-medium uppercase tracking-normal text-[var(--text-muted)]">
                {row.label}
              </p>
              <p
                className={cn(
                  "mt-2 text-lg font-semibold",
                  row.tone === "emerald"
                    ? "text-[var(--positive)]"
                    : "text-[var(--negative)]",
                )}
              >
                {preciseCurrency(row.value)}
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                {row.detail}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-3">
          <div className="mb-2 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-[var(--text-primary)]">
                Budget vs werkelijk
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                Variabele kosten t/m dag {pacing.dataDays}
              </p>
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              {pacing.historyMonths > 0
                ? `${pacing.historyMonths} mnd gemiddeld`
                : "Nog geen historie"}
            </p>
          </div>
          <div className="h-36 sm:h-40">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <BarChart
                data={pacingChartRows}
                barCategoryGap="28%"
                margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
              >
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
                />
                <YAxis domain={[0, Math.ceil(maxPacingValue * 1.12)]} hide />
                <ReferenceLine
                  y={pacing.estimatedVariableTotal}
                  stroke="rgba(250, 250, 250, 0.62)"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
                <Bar dataKey="value" radius={[8, 8, 3, 3]} minPointSize={14}>
                  <LabelList
                    dataKey="value"
                    position="insideTop"
                    formatter={(value) => currency(Number(value ?? 0))}
                    fill="#FAFAFA"
                    fontSize={11}
                    fontWeight={700}
                  />
                  {pacingChartRows.map((row) => (
                    <Cell key={row.label} fill={row.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="secondary"
            className="h-10 justify-center"
            onClick={() => onExportExcel(currentMonth)}
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-10 justify-center"
            onClick={() => onExportPdf(currentMonth)}
          >
            <ReceiptText className="h-4 w-4" />
            PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SavingsCard({
  accountName,
  snapshot,
  currentBalance,
  depositTotal,
  suggestionAmount,
  startAmount,
  startDate,
  depositAmount,
  depositDate,
  message,
  isSavingSnapshot,
  isSavingDeposit,
  onStartAmountChange,
  onStartDateChange,
  onDepositAmountChange,
  onDepositDateChange,
  onSaveStartBalance,
  onAddDeposit,
}: {
  accountName: string;
  snapshot?: AccountBalanceSnapshot;
  currentBalance: number | null;
  depositTotal: number;
  suggestionAmount: number;
  startAmount: string;
  startDate: string;
  depositAmount: string;
  depositDate: string;
  message: string;
  isSavingSnapshot: boolean;
  isSavingDeposit: boolean;
  onStartAmountChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onDepositAmountChange: (value: string) => void;
  onDepositDateChange: (value: string) => void;
  onSaveStartBalance: () => void;
  onAddDeposit: () => boolean | Promise<boolean>;
}) {
  const [isDepositOpen, setIsDepositOpen] = useState(false);

  return (
    <Card className="finance-card">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Sparen</CardTitle>
            <CardDescription>{accountName}</CardDescription>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-emerald-400/20 bg-[var(--positive-light)] text-[var(--positive)]">
            <WalletCards className="h-5 w-5" />
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-[14px] border border-emerald-400/20 bg-[var(--positive-light)] p-3">
          <p className="text-[11px] font-medium uppercase tracking-normal text-[var(--text-muted)]">
            Huidig spaarsaldo
          </p>
          <p className="mt-1 text-2xl font-semibold text-[var(--positive)]">
            {currentBalance === null ? "Geen saldo" : currency(currentBalance)}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {snapshot
              ? `Saldo ${currency(snapshot.balance)} op ${snapshot.snapshotDate} · ${currency(depositTotal)} weggezet`
              : "Voer eerst een saldo in."}
          </p>
        </div>

        {suggestionAmount > 0 && (
          <p className="rounded-[12px] border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-secondary)]">
            Verwacht {currency(suggestionAmount)} over deze maand — wegzetten?
          </p>
        )}

        <details className="group rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium text-[var(--text-primary)]">
            Saldo aanpassen
            <Plus className="h-4 w-4 text-[var(--text-muted)] transition group-open:rotate-45" />
          </summary>
          <div className="grid gap-2 border-t border-[var(--border)] p-3 sm:grid-cols-[1fr_9.5rem_auto]">
            <Input
              inputMode="decimal"
              placeholder="Saldo"
              value={startAmount}
              className="h-10"
              onChange={(event) => onStartAmountChange(event.target.value)}
            />
            <Input
              type="date"
              value={startDate}
              className="h-10"
              onChange={(event) => onStartDateChange(event.target.value)}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-10 justify-center"
              disabled={isSavingSnapshot}
              onClick={onSaveStartBalance}
            >
              {isSavingSnapshot ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Bewaar
            </Button>
          </div>
        </details>

        <Button
          type="button"
          variant="secondary"
          className="h-10 w-full justify-center border-emerald-400/20 text-emerald-200 hover:border-emerald-400/30 hover:bg-emerald-500/10"
          onClick={() => setIsDepositOpen(true)}
        >
          <ArrowDownToLine className="h-4 w-4" />
          Storting toevoegen
        </Button>

        {message && (
          <p className="rounded-[12px] border border-[var(--border)] bg-black/10 p-3 text-sm text-[var(--text-secondary)]">
            {message}
          </p>
        )}
        <SavingsDepositDialog
          open={isDepositOpen}
          accountName={accountName}
          amount={depositAmount}
          date={depositDate}
          message={message}
          isSaving={isSavingDeposit}
          onAmountChange={onDepositAmountChange}
          onDateChange={onDepositDateChange}
          onClose={() => setIsDepositOpen(false)}
          onSubmit={onAddDeposit}
        />
      </CardContent>
    </Card>
  );
}

function SavingsDepositDialog({
  open,
  accountName,
  amount,
  date,
  message,
  isSaving,
  onAmountChange,
  onDateChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  accountName: string;
  amount: string;
  date: string;
  message: string;
  isSaving: boolean;
  onAmountChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => boolean | Promise<boolean>;
}) {
  if (!open) {
    return null;
  }

  async function handleSubmit() {
    const saved = await onSubmit();

    if (saved) {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-end bg-black/75 p-0 backdrop-blur-xl sm:place-items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Spaarstorting toevoegen"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-[24px] border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-2xl sm:max-w-md sm:rounded-[24px] sm:p-5"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Storting toevoegen
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Geld wegzetten op {accountName}.
            </p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-9 w-9 text-[var(--text-muted)]"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-4">
          <FieldLabel label="Bedrag">
            <Input
              inputMode="decimal"
              placeholder="Bedrag"
              value={amount}
              className="h-12 text-lg font-semibold"
              onChange={(event) => onAmountChange(event.target.value)}
            />
          </FieldLabel>

          <FieldLabel label="Datum">
            <Input
              type="date"
              value={date}
              className="finance-mobile-date-anchor h-10"
              onChange={(event) => onDateChange(event.target.value)}
            />
          </FieldLabel>

          {message && (
            <p className="rounded-[12px] border border-[var(--border)] bg-[var(--bg-surface)] p-3 text-sm text-[var(--text-secondary)]">
              {message}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              className="h-11"
              onClick={onClose}
            >
              Annuleren
            </Button>
            <Button
              type="button"
              className="accent-glow-hover h-11"
              disabled={isSaving}
              onClick={() => void handleSubmit()}
            >
              {isSaving ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowDownToLine className="h-4 w-4" />
              )}
              Opslaan
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InvestmentSection({
  degiroPositions,
  degiroName,
  degiroTicker,
  degiroAmount,
  cryptoPositions,
  cryptoCoinName,
  cryptoCoinId,
  cryptoTicker,
  cryptoAmount,
  message,
  isSavingDegiroPosition,
  isSavingCryptoPosition,
  deletingDegiroPositionId,
  deletingCryptoPositionId,
  onDegiroNameChange,
  onDegiroTickerChange,
  onDegiroAmountChange,
  onAddDegiroPosition,
  onDeleteDegiroPosition,
  onCryptoCoinNameChange,
  onCryptoCoinIdChange,
  onCryptoTickerChange,
  onCryptoAmountChange,
  onAddCryptoPosition,
  onDeleteCryptoPosition,
}: {
  degiroPositions: DegiroPosition[];
  degiroName: string;
  degiroTicker: string;
  degiroAmount: string;
  cryptoPositions: CryptoPosition[];
  cryptoCoinName: string;
  cryptoCoinId: string;
  cryptoTicker: string;
  cryptoAmount: string;
  message: string;
  isSavingDegiroPosition: boolean;
  isSavingCryptoPosition: boolean;
  deletingDegiroPositionId: string | null;
  deletingCryptoPositionId: string | null;
  onDegiroNameChange: (value: string) => void;
  onDegiroTickerChange: (value: string) => void;
  onDegiroAmountChange: (value: string) => void;
  onAddDegiroPosition: () => void;
  onDeleteDegiroPosition: (position: DegiroPosition) => void;
  onCryptoCoinNameChange: (value: string) => void;
  onCryptoCoinIdChange: (value: string) => void;
  onCryptoTickerChange: (value: string) => void;
  onCryptoAmountChange: (value: string) => void;
  onAddCryptoPosition: () => void;
  onDeleteCryptoPosition: (position: CryptoPosition) => void;
}) {
  const [isDegiroModalOpen, setIsDegiroModalOpen] = useState(false);
  const [isCryptoModalOpen, setIsCryptoModalOpen] = useState(false);
  const degiroTickers = useMemo(
    () =>
      Array.from(
        new Set(
          degiroPositions
            .map((position) => position.ticker.trim())
            .filter(Boolean),
        ),
      ).sort(),
    [degiroPositions],
  );
  const coinIds = useMemo(
    () =>
      Array.from(
        new Set(
          cryptoPositions
            .map((position) => position.coinId.trim())
            .filter(Boolean),
        ),
      ).sort(),
    [cryptoPositions],
  );
  const {
    pricesByTicker,
    isLoadingPrices: isLoadingDegiroPrices,
    priceMessage: degiroPriceMessage,
  } = useDegiroPrices(degiroTickers);
  const { pricesByCoinId, isLoadingPrices, priceMessage } =
    useCryptoPrices(coinIds);

  const degiroRows = degiroPositions.map((position) => {
    const price = pricesByTicker[position.ticker];
    const value = typeof price === "number" ? price * position.amount : null;

    return {
      position,
      price,
      value,
    };
  });
  const degiroTotal = degiroRows.reduce(
    (total, row) => total + (row.value ?? 0),
    0,
  );
  const cryptoRows = cryptoPositions.map((position) => {
    const price = pricesByCoinId[position.coinId];
    const value = typeof price === "number" ? price * position.amount : null;

    return {
      position,
      price,
      value,
    };
  });
  const cryptoTotal = cryptoRows.reduce(
    (total, row) => total + (row.value ?? 0),
    0,
  );
  const investmentTotal = degiroTotal + cryptoTotal;

  return (
    <Card className="border-[#27272A] bg-[#18181B]">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Investeren</CardTitle>
          </div>
          <a
            href="https://app.portfoliodividendtracker.com/login"
            target="_blank"
            rel="noreferrer"
            aria-label="Open PDT"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-[#27272A] text-[#A1A1AA] transition hover:bg-white/[0.04] hover:text-[#FAFAFA]"
          >
            <Globe className="h-5 w-5" />
          </a>
        </div>
      </CardHeader>
      <CardContent className="space-y-0">
        <section className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA]">
                DEGIRO
              </p>
              {isLoadingDegiroPrices && (
                <p className="mt-1 text-xs text-[#A1A1AA]">Koersen laden...</p>
              )}
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="DeGiro-positie toevoegen"
              className="h-10 w-10 shrink-0 text-[#A1A1AA] hover:bg-white/[0.04] hover:text-[#FAFAFA]"
              onClick={() => setIsDegiroModalOpen(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-3">
            {degiroRows.length === 0 ? (
              <p className="text-sm text-[#A1A1AA]">
                Nog geen posities
              </p>
            ) : (
              <div className="grid">
                <div className="hidden grid-cols-[minmax(0,1.3fr)_0.7fr_0.9fr_0.9fr_0.9fr_40px] gap-3 border-b border-[#27272A] pb-2 text-xs font-medium uppercase tracking-wider text-[#A1A1AA] md:grid">
                  <span>Naam</span>
                  <span>Ticker</span>
                  <span className="text-right">Aantal</span>
                  <span className="text-right">Koers</span>
                  <span className="text-right">Waarde</span>
                  <span />
                </div>
                {degiroRows.map(({ position, price, value }) => (
                  <div
                    key={position.id}
                    className="grid gap-2 border-b border-[#27272A] py-3 last:border-b-0 md:grid-cols-[minmax(0,1.3fr)_0.7fr_0.9fr_0.9fr_0.9fr_40px] md:items-center md:gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#FAFAFA]">
                        {position.name}
                      </p>
                      <p className="text-xs text-[#A1A1AA] md:hidden">
                        {position.ticker}
                      </p>
                    </div>
                    <p className="hidden text-sm text-[#A1A1AA] md:block">
                      {position.ticker}
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-xs text-[#A1A1AA] md:contents">
                      <p className="md:text-right md:text-sm">
                        <span className="block md:hidden">Aantal</span>
                        <span className="font-medium text-[#FAFAFA] md:text-[#A1A1AA]">
                          {formatCryptoAmount(position.amount)}
                        </span>
                      </p>
                      <p className="text-right md:text-sm">
                        <span className="block md:hidden">Koers</span>
                        <span className="font-medium text-[#FAFAFA] md:text-[#A1A1AA]">
                          {typeof price === "number" ? preciseCurrency(price) : "-"}
                        </span>
                      </p>
                      <p className="text-right md:text-sm">
                        <span className="block md:hidden">Waarde</span>
                        <span className="font-semibold text-[#FAFAFA]">
                          {value === null ? "-" : preciseCurrency(value)}
                        </span>
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 justify-self-end text-[#A1A1AA] hover:bg-white/[0.04] hover:text-red-300"
                      disabled={deletingDegiroPositionId === position.id}
                      onClick={() => onDeleteDegiroPosition(position)}
                    >
                      {deletingDegiroPositionId === position.id ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {degiroPositions.length > 0 && (
            <div className="mt-3 border-t border-[#27272A] pt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA]">
                TOTAAL DEGIRO
              </p>
              <p className="mt-1 text-xl font-semibold text-[#FAFAFA]">
                {currency(degiroTotal)}
              </p>
            </div>
          )}

          {degiroPriceMessage && (
            <p className="mt-2 text-xs text-[#A1A1AA]">
              {degiroPriceMessage}
            </p>
          )}
        </section>

        <section className="border-t border-[#27272A] py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA]">
                CRYPTO
              </p>
              {isLoadingPrices && (
                <p className="mt-1 text-xs text-[#A1A1AA]">Koersen laden...</p>
              )}
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Crypto-positie toevoegen"
              className="h-10 w-10 shrink-0 text-[#A1A1AA] hover:bg-white/[0.04] hover:text-[#FAFAFA]"
              onClick={() => setIsCryptoModalOpen(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-3">
            {cryptoRows.length === 0 ? (
              <p className="text-sm text-[#A1A1AA]">
                Nog geen posities
              </p>
            ) : (
              <div className="grid">
                <div className="hidden grid-cols-[minmax(0,1.3fr)_0.7fr_0.9fr_0.9fr_0.9fr_40px] gap-3 border-b border-[#27272A] pb-2 text-xs font-medium uppercase tracking-wider text-[#A1A1AA] md:grid">
                  <span>Naam</span>
                  <span>Ticker</span>
                  <span className="text-right">Hoeveelheid</span>
                  <span className="text-right">Koers</span>
                  <span className="text-right">Waarde</span>
                  <span />
                </div>
                {cryptoRows.map(({ position, price, value }) => (
                  <div
                    key={position.id}
                    className="grid gap-2 border-b border-[#27272A] py-3 last:border-b-0 md:grid-cols-[minmax(0,1.3fr)_0.7fr_0.9fr_0.9fr_0.9fr_40px] md:items-center md:gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#FAFAFA]">
                        {position.coinName}
                      </p>
                      <p className="text-xs text-[#A1A1AA] md:hidden">
                        {position.ticker}
                      </p>
                    </div>
                    <p className="hidden text-sm text-[#A1A1AA] md:block">
                      {position.ticker}
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-xs text-[#A1A1AA] md:contents">
                      <p className="md:text-right md:text-sm">
                        <span className="block md:hidden">Hoeveelheid</span>
                        <span className="font-medium text-[#FAFAFA] md:text-[#A1A1AA]">
                          {formatCryptoAmount(position.amount)}
                        </span>
                      </p>
                      <p className="text-right md:text-sm">
                        <span className="block md:hidden">Koers</span>
                        <span className="font-medium text-[#FAFAFA] md:text-[#A1A1AA]">
                          {typeof price === "number" ? preciseCurrency(price) : "-"}
                        </span>
                      </p>
                      <p className="text-right md:text-sm">
                        <span className="block md:hidden">Waarde</span>
                        <span className="font-semibold text-[#FAFAFA]">
                          {value === null ? "-" : preciseCurrency(value)}
                        </span>
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 justify-self-end text-[#A1A1AA] hover:bg-white/[0.04] hover:text-red-300"
                      disabled={deletingCryptoPositionId === position.id}
                      onClick={() => onDeleteCryptoPosition(position)}
                    >
                      {deletingCryptoPositionId === position.id ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {cryptoPositions.length > 0 && (
            <div className="mt-3 border-t border-[#27272A] pt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA]">
                TOTAAL CRYPTO
              </p>
              <p className="mt-1 text-xl font-semibold text-[#FAFAFA]">
                {currency(cryptoTotal)}
              </p>
            </div>
          )}

          {priceMessage && (
            <p className="mt-2 text-xs text-[#A1A1AA]">
              {priceMessage}
            </p>
          )}
        </section>

        {message && (
          <p className="mb-4 rounded-[12px] border border-[#27272A] bg-black/10 p-3 text-sm text-[#A1A1AA]">
            {message}
          </p>
        )}

        <section className="flex items-center justify-between gap-4 border-t border-[#27272A] pt-3">
          <p className="text-sm text-[#A1A1AA]">Investeren totaal</p>
          <p className="text-xl font-semibold text-[#FAFAFA]">
            {currency(investmentTotal)}
          </p>
        </section>
      </CardContent>
      {isDegiroModalOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:items-center sm:pb-4">
          <div className="w-full max-w-lg rounded-[18px] border border-[#27272A] bg-[#18181B] p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA]">
                  DEGIRO
                </p>
                <h3 className="mt-1 text-lg font-semibold text-[#FAFAFA]">
                  Positie toevoegen
                </h3>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-9 w-9 shrink-0 text-[#A1A1AA] hover:bg-white/[0.04] hover:text-[#FAFAFA]"
                onClick={() => setIsDegiroModalOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <FieldLabel label="Naam">
                <Input
                  placeholder="Vanguard FTSE All-World"
                  value={degiroName}
                  className="h-10 border-[#27272A] bg-black/20 text-[#FAFAFA]"
                  onChange={(event) => onDegiroNameChange(event.target.value)}
                />
              </FieldLabel>
              <FieldLabel label="Ticker">
                <Input
                  placeholder="VWRL.AS"
                  value={degiroTicker}
                  className="h-10 border-[#27272A] bg-black/20 text-[#FAFAFA]"
                  onChange={(event) => onDegiroTickerChange(event.target.value)}
                />
              </FieldLabel>
              <FieldLabel label="Aantal">
                <Input
                  inputMode="decimal"
                  placeholder="0,000000"
                  value={degiroAmount}
                  className="h-10 border-[#27272A] bg-black/20 text-[#FAFAFA] sm:col-span-2"
                  onChange={(event) => onDegiroAmountChange(event.target.value)}
                />
              </FieldLabel>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-10 text-[#A1A1AA] hover:bg-white/[0.04] hover:text-[#FAFAFA]"
                onClick={() => setIsDegiroModalOpen(false)}
              >
                Sluiten
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-10 justify-center"
                disabled={isSavingDegiroPosition}
                onClick={onAddDegiroPosition}
              >
                {isSavingDegiroPosition ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Toevoegen
              </Button>
            </div>
          </div>
        </div>
      )}
      {isCryptoModalOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 sm:items-center sm:pb-4">
          <div className="w-full max-w-lg rounded-[18px] border border-[#27272A] bg-[#18181B] p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA]">
                  CRYPTO
                </p>
                <h3 className="mt-1 text-lg font-semibold text-[#FAFAFA]">
                  Positie toevoegen
                </h3>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-9 w-9 shrink-0 text-[#A1A1AA] hover:bg-white/[0.04] hover:text-[#FAFAFA]"
                onClick={() => setIsCryptoModalOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <FieldLabel label="Naam">
                <Input
                  placeholder="Bitcoin"
                  value={cryptoCoinName}
                  className="h-10 border-[#27272A] bg-black/20 text-[#FAFAFA]"
                  onChange={(event) => onCryptoCoinNameChange(event.target.value)}
                />
              </FieldLabel>
              <FieldLabel label="CoinGecko ID">
                <Input
                  placeholder="bitcoin"
                  value={cryptoCoinId}
                  className="h-10 border-[#27272A] bg-black/20 text-[#FAFAFA]"
                  onChange={(event) => onCryptoCoinIdChange(event.target.value)}
                />
              </FieldLabel>
              <FieldLabel label="Ticker">
                <Input
                  placeholder="BTC"
                  value={cryptoTicker}
                  className="h-10 border-[#27272A] bg-black/20 text-[#FAFAFA]"
                  onChange={(event) => onCryptoTickerChange(event.target.value)}
                />
              </FieldLabel>
              <FieldLabel label="Hoeveelheid">
                <Input
                  inputMode="decimal"
                  placeholder="0,00000000"
                  value={cryptoAmount}
                  className="h-10 border-[#27272A] bg-black/20 text-[#FAFAFA]"
                  onChange={(event) => onCryptoAmountChange(event.target.value)}
                />
              </FieldLabel>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-10 text-[#A1A1AA] hover:bg-white/[0.04] hover:text-[#FAFAFA]"
                onClick={() => setIsCryptoModalOpen(false)}
              >
                Sluiten
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-10 justify-center"
                disabled={isSavingCryptoPosition}
                onClick={onAddCryptoPosition}
              >
                {isSavingCryptoPosition ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Toevoegen
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function useCryptoPrices(coinIds: string[]) {
  const coinIdKey = useMemo(() => coinIds.join(","), [coinIds]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const serializedPricesRef = useRef("");
  const [pricesByCoinId, setPricesByCoinId] = useState<Record<string, number>>(
    {},
  );
  const [isLoadingPrices, setIsLoadingPrices] = useState(false);
  const [priceMessage, setPriceMessage] = useState("");

  const loadPrices = useCallback(async () => {
    if (!coinIdKey) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoadingPrices(true);
    setPriceMessage((current) => (current ? "" : current));

    try {
      const ids = coinIdKey.split(",");
      const encodedIds = ids.map(encodeURIComponent).join(",");
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${encodedIds}&vs_currencies=eur`,
        { signal: controller.signal },
      );

      if (!response.ok) {
        throw new Error("Koersen ophalen lukte niet.");
      }

      const data = (await response.json()) as Record<string, { eur?: number }>;
      const nextPrices = Object.fromEntries(
        ids.flatMap((coinId) => {
          const price = data[coinId]?.eur;
          return typeof price === "number" ? [[coinId, price]] : [];
        }),
      );
      const serializedPrices = JSON.stringify(nextPrices);

      if (serializedPricesRef.current !== serializedPrices) {
        serializedPricesRef.current = serializedPrices;
        setPricesByCoinId(nextPrices);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setPriceMessage("Live koersen ophalen lukte niet.");
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setIsLoadingPrices(false);
      }
    }
  }, [coinIdKey]);

  useEffect(() => {
    if (!coinIdKey) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      serializedPricesRef.current = "";
      setPricesByCoinId((current) =>
        Object.keys(current).length === 0 ? current : {},
      );
      setPriceMessage((current) => (current ? "" : current));
      setIsLoadingPrices(false);
      return;
    }

    void loadPrices();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [coinIdKey, loadPrices]);

  return { pricesByCoinId, isLoadingPrices, priceMessage };
}

function useDegiroPrices(tickers: string[]) {
  const tickerKey = useMemo(() => tickers.join(","), [tickers]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const serializedPricesRef = useRef("");
  const [pricesByTicker, setPricesByTicker] = useState<Record<string, number | null>>(
    {},
  );
  const [isLoadingPrices, setIsLoadingPrices] = useState(false);
  const [priceMessage, setPriceMessage] = useState("");

  const loadPrices = useCallback(async () => {
    if (!tickerKey) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoadingPrices(true);
    setPriceMessage((current) => (current ? "" : current));

    try {
      const response = await fetch(
        `/api/degiro-prices?tickers=${encodeURIComponent(tickerKey)}`,
        { signal: controller.signal },
      );

      if (!response.ok) {
        throw new Error("Koersen ophalen lukte niet.");
      }

      const nextPrices = (await response.json()) as Record<string, number | null>;
      const serializedPrices = JSON.stringify(nextPrices);

      if (serializedPricesRef.current !== serializedPrices) {
        serializedPricesRef.current = serializedPrices;
        setPricesByTicker(nextPrices);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setPriceMessage("Live DeGiro-koersen ophalen lukte niet.");
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setIsLoadingPrices(false);
      }
    }
  }, [tickerKey]);

  useEffect(() => {
    if (!tickerKey) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      serializedPricesRef.current = "";
      setPricesByTicker((current) =>
        Object.keys(current).length === 0 ? current : {},
      );
      setPriceMessage((current) => (current ? "" : current));
      setIsLoadingPrices(false);
      return;
    }

    void loadPrices();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [tickerKey, loadPrices]);

  return { pricesByTicker, isLoadingPrices, priceMessage };
}

function AllTransactionsCard({
  currentMonth,
  rows,
  freeSpaceTotal,
  fixedTotal,
  deletingTransactionId,
  onDeleteTransaction,
  onEditTransaction,
  onOpenReceipt,
}: {
  currentMonth: string;
  rows: OutgoingTransactionRow[];
  freeSpaceTotal: number;
  fixedTotal: number;
  deletingTransactionId: string | null;
  onDeleteTransaction: (transaction: Transaction) => void;
  onEditTransaction: (transaction: Transaction) => void;
  onOpenReceipt: (receipt: ReceiptViewerState) => void;
}) {
  const [displayLimit, setDisplayLimit] = useState<TransactionDisplayLimit>(10);
  const today = new Date().toISOString().slice(0, 10);
  const currentRows = rows.filter((row) => row.date <= today);
  const visibleRows =
    displayLimit === "all" ? currentRows : currentRows.slice(0, displayLimit);

  return (
    <Card className="finance-card overflow-hidden">
      <CardHeader className="grid gap-3 pb-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <CardTitle>Alle transacties</CardTitle>
          <CardDescription>
            Alle transacties deze maand.
          </CardDescription>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-[260px]">
          <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-normal text-[var(--text-muted)]">
              Vrije ruimte
            </p>
            <p
              className={cn(
                "mt-1 text-sm font-semibold",
                freeSpaceTotal < 0
                  ? "text-[var(--negative)]"
                  : "text-[var(--positive)]",
              )}
            >
              {currency(freeSpaceTotal)}
            </p>
          </div>
          <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-normal text-[var(--text-muted)]">
              Afschrijvingen
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
              {currency(fixedTotal)}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {currentRows.length > 0 ? (
          <div className="divide-y divide-[var(--border)]">
            {visibleRows.map((row) => {
              const isUpcoming =
                row.state === "today" || row.state === "upcoming";
              const isDeleting =
                !!row.transaction && deletingTransactionId === row.transaction.id;
              const hasActions =
                Boolean(row.transaction) ||
                Boolean(row.receiptUrl);

	              return (
	                <div
	                  key={row.id}
	                  className={cn(
	                    "group/transaction flex items-center justify-between gap-3 px-4 py-3 sm:px-5",
	                    row.isExpected &&
	                      "border-l-2 border-dashed border-l-[var(--positive)] bg-[var(--positive-light)]/40 text-[var(--text-secondary)]",
	                  )}
	                >
	                  <div className="flex min-w-0 flex-1 items-center gap-3">
	                    <div className="w-10 shrink-0 text-center">
	                      <p className="text-[10px] font-medium uppercase text-[var(--text-muted)]">
	                        {new Intl.DateTimeFormat("nl-NL", {
	                          month: "short",
	                        }).format(new Date(`${row.date}T00:00:00`))}
	                      </p>
	                      <p className="text-sm font-semibold text-[var(--text-primary)]">
	                        {Number(row.date.slice(8, 10))}
	                      </p>
	                    </div>
	                    {row.signedAmount >= 0 ? (
	                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-400/20 bg-[var(--positive-light)] text-[var(--positive)]">
	                        <ArrowDownToLine className="h-4 w-4" />
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)]",
                          isUpcoming &&
                            "border-[var(--accent)] bg-[var(--accent-light)]",
                        )}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: row.color }}
                        />
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                        {row.title}
                      </p>
	                      <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
	                        {row.subtitle}
	                      </p>
	                    </div>
	                  </div>
	                  <div className="grid shrink-0 grid-cols-[5.75rem_7rem] items-center gap-2 text-right">
	                    <div className="min-w-0">
	                      <p
	                        className={cn(
	                          "text-sm font-semibold",
	                          row.signedAmount >= 0
	                            ? "text-[var(--positive)]"
	                            : "text-[var(--negative)]",
	                        )}
	                      >
	                        {row.signedAmount >= 0 ? "+" : "-"}
	                        {preciseCurrency(Math.abs(row.signedAmount))}
	                      </p>
	                      {row.isExpected && (
	                        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
	                          Verwacht
	                        </p>
	                      )}
	                    </div>
	                    <div className="flex w-28 items-center justify-end gap-1">
	                    {row.transaction && (
	                      <Button
	                        type="button"
	                        size="icon"
	                        variant="ghost"
	                        title="Bewerk transactie"
	                        className="h-8 w-8 shrink-0 text-[var(--text-muted)] opacity-100 hover:text-[var(--accent)] sm:opacity-0 sm:transition sm:group-hover/transaction:opacity-100 sm:group-focus-within/transaction:opacity-100"
	                        onClick={() => onEditTransaction(row.transaction!)}
	                      >
	                        <Pencil className="h-4 w-4" />
	                      </Button>
	                    )}
	                    {row.receiptUrl && (
	                      <ReceiptAttachment
	                        receiptUrl={row.receiptUrl}
                        title={`${row.title} · ${row.date}`}
	                        onOpen={onOpenReceipt}
	                        compact
	                      />
	                    )}
	                    {row.transaction && (
	                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Verwijder transactie"
                        className="h-8 w-8 shrink-0 text-[var(--text-muted)] opacity-100 hover:text-[var(--negative)] sm:opacity-0 sm:transition sm:group-hover/transaction:opacity-100 sm:group-focus-within/transaction:opacity-100"
                        disabled={isDeleting}
                        onClick={() => onDeleteTransaction(row.transaction!)}
                      >
                        {isDeleting ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    {!hasActions && (
                      <span aria-hidden="true" className="h-8 w-full opacity-0" />
                    )}
	                    </div>
                  </div>
                </div>
              );
            })}
            {currentRows.length > 10 && (
              <TransactionDisplayLimitPicker
                value={displayLimit}
                onChange={setDisplayLimit}
              />
            )}
          </div>
        ) : (
          <div className="m-4 rounded-[14px] border border-dashed border-[var(--border)] bg-[var(--bg-surface)] p-4 text-sm text-[var(--text-secondary)] sm:m-5">
            Nog geen transacties in {monthLabel(currentMonth)}.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TransactionDisplayLimitPicker({
  value,
  onChange,
}: {
  value: TransactionDisplayLimit;
  onChange: (value: TransactionDisplayLimit) => void;
}) {
  const options = [
    { label: "10", value: 10 },
    { label: "15", value: 15 },
    { label: "20", value: 20 },
    { label: "Alles", value: "all" },
  ] satisfies Array<{ label: string; value: TransactionDisplayLimit }>;

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-xs text-[var(--text-secondary)] sm:px-5">
      <span>Weergeven:</span>
      <div className="flex flex-wrap items-center gap-1">
        {options.map((option) => {
          const isActive = value === option.value;

          return (
            <button
              key={option.label}
              type="button"
              className={cn(
                "rounded-[999px] px-2.5 py-1 font-medium transition",
                isActive
                  ? "bg-[var(--accent-light)] text-[var(--accent)]"
                  : "text-[var(--text-muted)] hover:bg-white/[0.04] hover:text-[var(--text-primary)]",
              )}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TransactionEditDialog({
  transaction,
  categories,
  variableCategories,
  labels,
  householdMembers,
  amount,
  date,
  note,
  category,
  paidById,
  contributionKind,
  message,
  isSaving,
  onAmountChange,
  onDateChange,
  onNoteChange,
  onCategoryChange,
  onPaidByChange,
  onContributionKindChange,
  onCreateCategory,
  onClose,
  onSave,
}: {
  transaction: Transaction;
  categories: DashboardData["categories"];
  variableCategories: DashboardData["categories"];
  labels: Map<string, DashboardData["categories"][number]>;
  householdMembers: DashboardData["householdMembers"];
  amount: string;
  date: string;
  note: string;
  category: string;
  paidById: string;
  contributionKind: ContributionKind;
  message: string;
  isSaving: boolean;
  onAmountChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onPaidByChange: (value: string) => void;
  onContributionKindChange: (value: ContributionKind) => void;
  onCreateCategory: (name: string) => Promise<{
    category?: DashboardData["categories"][number];
    error?: string;
  }>;
  onClose: () => void;
  onSave: () => void;
}) {
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryMessage, setNewCategoryMessage] = useState("");
  const [isSavingNewCategory, setIsSavingNewCategory] = useState(false);
  const categoryOptions = transactionCategoryOptions(
    transaction,
    categories,
    variableCategories,
  );
  const selectedCategory = categoryOptions.some((item) => item.id === category)
    ? category
    : categoryOptions[0]?.id ?? "";
  useEffect(() => {
    if (selectedCategory && selectedCategory !== category) {
      onCategoryChange(selectedCategory);
    }
  }, [category, onCategoryChange, selectedCategory]);

  async function saveNewCategory() {
    const cleanName = newCategoryName.trim().replace(/\s+/g, " ");

    if (!cleanName) {
      setNewCategoryMessage("Vul een categorienaam in.");
      return;
    }

    setIsSavingNewCategory(true);
    setNewCategoryMessage("");

    const result = await onCreateCategory(cleanName);

    setIsSavingNewCategory(false);

    if (result.error || !result.category) {
      setNewCategoryMessage(result.error ?? "Categorie opslaan lukte niet.");
      return;
    }

    onCategoryChange(result.category.id);
    setNewCategoryName("");
    setNewCategoryMessage("");
    setIsAddingCategory(false);
  }

  const title =
    transaction.type === "fixed"
      ? labels.get(transaction.categoryId)?.name ?? "Vaste last"
      : transaction.type === "income"
      ? labels.get(transaction.categoryId)?.name ?? "Inkomen"
      : transaction.type === "contribution"
        ? contributionDisplayName(transaction, true)
        : transaction.type === "sparen"
          ? SAVINGS_CATEGORY_NAME
          : labels.get(transaction.categoryId)?.name ?? "Uitgave";
  const dialogTitle =
    transaction.type === "income"
      ? "Inkomen wijzigen"
      : transaction.type === "contribution"
        ? "Storting wijzigen"
        : transaction.type === "sparen"
          ? "Spaarstorting wijzigen"
          : transaction.type === "fixed"
            ? "Vaste last wijzigen"
            : "Uitgave wijzigen";

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/75 p-0 backdrop-blur-xl sm:place-items-center sm:p-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
        className="w-full rounded-t-[24px] border border-[var(--border-strong)] bg-[var(--bg-card)] shadow-2xl sm:max-w-lg sm:rounded-[24px]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            <p className="text-lg font-semibold text-[var(--text-primary)]">
              {dialogTitle}
            </p>
            <p className="mt-1 truncate text-sm text-[var(--text-secondary)]">
              {title} · {transaction.accountName ?? "Rekening"}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Sluiten"
            onClick={onClose}
            disabled={isSaving}
            className="h-9 w-9 shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-3 px-5 py-4">
          <FieldLabel label="Categorie">
            <Select
              value={selectedCategory}
              className="h-11"
              onChange={(event) => onCategoryChange(event.target.value)}
            >
              {categoryOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
            <div className="mt-2 rounded-[12px] border border-[var(--border)] bg-black/10 p-2">
              {isAddingCategory ? (
                <div className="grid gap-2">
                  <Input
                    value={newCategoryName}
                    placeholder="Bijv. Uit eten"
                    className="h-10"
                    maxLength={40}
                    disabled={isSavingNewCategory}
                    onChange={(event) => setNewCategoryName(event.target.value)}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={isSavingNewCategory}
                      onClick={() => {
                        setIsAddingCategory(false);
                        setNewCategoryName("");
                        setNewCategoryMessage("");
                      }}
                    >
                      Annuleer
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={isSavingNewCategory}
                      onClick={saveNewCategory}
                    >
                      {isSavingNewCategory ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      Opslaan
                    </Button>
                  </div>
                  {newCategoryMessage && (
                    <p className="text-xs text-[var(--negative)]">
                      {newCategoryMessage}
                    </p>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-[10px] px-3 py-2 text-sm font-medium text-[var(--accent)] transition hover:bg-[var(--accent-light)]"
                  onClick={() => {
                    setIsAddingCategory(true);
                    setNewCategoryMessage("");
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Nieuwe categorie
                </button>
              )}
            </div>
          </FieldLabel>

          <div className="grid gap-3 sm:grid-cols-2">
            <FieldLabel label="Bedrag">
              <Input
                inputMode="decimal"
                value={amount}
                className="h-11 text-base font-semibold"
                onChange={(event) => onAmountChange(event.target.value)}
              />
            </FieldLabel>
            <FieldLabel label="Datum">
              <Input
                type="date"
                value={date}
                className="h-11"
                onChange={(event) => onDateChange(event.target.value)}
              />
            </FieldLabel>
          </div>

          {householdMembers.length > 0 && (
            <FieldLabel label="Betaald door">
              <Select
                value={paidById}
                className="h-11"
                onChange={(event) => onPaidByChange(event.target.value)}
              >
                {householdMembers.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.displayName}
                  </option>
                ))}
              </Select>
            </FieldLabel>
          )}

          {transaction.type === "contribution" && (
            <FieldLabel label="Stortingstype">
              <Select
                value={contributionKind}
                className="h-11"
                onChange={(event) =>
                  onContributionKindChange(event.target.value as ContributionKind)
                }
              >
                {(["planned", "extra", "belastingteruggave"] as const).map(
                  (item) => (
                    <option key={item} value={item}>
                      {contributionKindLabel(item)}
                    </option>
                  ),
                )}
              </Select>
            </FieldLabel>
          )}

          <FieldLabel label="Notitie">
            <Textarea
              value={note}
              placeholder="Notitie optioneel"
              className="min-h-20"
              onChange={(event) => onNoteChange(event.target.value)}
            />
          </FieldLabel>

          {message && (
            <p className="rounded-[12px] border border-[var(--border)] bg-[var(--bg-surface)] p-3 text-sm text-[var(--text-secondary)]">
              {message}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSaving}
          >
            Annuleer
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Opslaan
          </Button>
        </div>
      </form>
    </div>
  );
}

function ReceiptAttachment({
  receiptUrl,
  title,
  onOpen,
  compact = false,
}: {
  receiptUrl: string;
  title: string;
  onOpen: (receipt: ReceiptViewerState) => void;
  compact?: boolean;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    getSupabaseBrowserClient()
      .storage.from("receipts")
      .createSignedUrl(receiptUrl, 60 * 10)
      .then(({ data }) => {
        if (isMounted) {
          setSignedUrl(data?.signedUrl ?? null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [receiptUrl]);

  return (
    <button
      type="button"
      disabled={!signedUrl}
      onClick={(event) => {
        event.stopPropagation();
        if (signedUrl) {
          onOpen({ url: signedUrl, title });
        }
      }}
      className={cn(
        "group flex shrink-0 items-center rounded-[10px] border border-[var(--border)] bg-[var(--bg-surface)] text-[11px] font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] disabled:cursor-wait disabled:opacity-50",
        compact ? "h-8 w-8 justify-center p-0" : "gap-2 px-2 py-1",
      )}
      title={signedUrl ? "Bekijk bon" : "Bon laden"}
    >
      <ReceiptText className="h-3.5 w-3.5 text-[var(--accent)]" />
      {!compact && <span>Bon</span>}
      {signedUrl && !compact && (
        <img
          src={signedUrl}
          alt=""
          className="hidden h-10 w-8 rounded-[6px] border border-[var(--border)] object-cover opacity-75 transition group-hover:opacity-100 lg:block"
        />
      )}
    </button>
  );
}

function ReceiptViewer({
  receipt,
  onClose,
}: {
  receipt: ReceiptViewerState;
  onClose: () => void;
}) {
  useEffect(() => {
    document.body.classList.add("receipt-printing-ready");

    return () => {
      document.body.classList.remove("receipt-printing-ready");
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid bg-black/80 p-4 backdrop-blur-xl sm:p-8">
      <div className="receipt-print-surface mx-auto grid h-full w-full max-w-4xl grid-rows-[auto_1fr] overflow-hidden rounded-[22px] border border-[var(--border-strong)] bg-[var(--bg-card)] shadow-2xl">
        <div className="receipt-print-controls flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
              Bon
            </p>
            <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
              {receipt.title}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              Print
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} title="Sluit bon">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="grid min-h-0 place-items-center overflow-auto bg-black/25 p-4 sm:p-6">
          <img
            src={receipt.url}
            alt={receipt.title}
            className="receipt-print-image max-h-full max-w-full rounded-[14px] border border-[var(--border)] object-contain shadow-2xl"
          />
        </div>
      </div>
    </div>
  );
}

function MonthInsightsSection({
  currentMonth,
  monthOptions,
  monthDescription,
  outgoingRows,
  totals,
  showIncome,
  freeSpaceTotal,
  fixedTotal,
  variableSpendPacing,
  monthMessage,
  categoryRows,
  selectedSixMonthTrend,
  chartsReady,
  deletingTransactionId,
  onMonthChange,
  onExportExcel,
  onExportPdf,
  onDeleteTransaction,
  onEditTransaction,
  onOpenReceipt,
}: {
  currentMonth: string;
  monthOptions: MonthOption[];
  monthDescription: string;
  outgoingRows: OutgoingTransactionRow[];
  totals: ReturnType<typeof totalsForMonth>;
  showIncome: boolean;
  freeSpaceTotal: number;
  fixedTotal: number;
  variableSpendPacing: VariableSpendPacingResult;
  monthMessage: string;
  categoryRows: ReturnType<typeof categoryTotals>;
  selectedSixMonthTrend: ReturnType<typeof sixMonthTrend>;
  chartsReady: boolean;
  deletingTransactionId: string | null;
  onMonthChange: (month: string) => void;
  onExportExcel: (month: string) => void;
  onExportPdf: (month: string) => void;
  onDeleteTransaction: (transaction: Transaction) => void;
  onEditTransaction: (transaction: Transaction) => void;
  onOpenReceipt: (receipt: ReceiptViewerState) => void;
}) {
  return (
    <section id="finance-month" className="scroll-mt-4 grid gap-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Maandinzichten
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Bij, af, verdeling en trend in een overzicht.
          </p>
        </div>
        <MonthNavigator
          currentMonth={currentMonth}
          monthOptions={monthOptions}
          onMonthChange={onMonthChange}
          compact
        />
      </div>

      <AllTransactionsCard
        currentMonth={currentMonth}
        rows={outgoingRows}
        freeSpaceTotal={freeSpaceTotal}
        fixedTotal={fixedTotal}
        deletingTransactionId={deletingTransactionId}
        onDeleteTransaction={onDeleteTransaction}
        onEditTransaction={onEditTransaction}
        onOpenReceipt={onOpenReceipt}
      />

      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(420px,0.95fr)_minmax(0,1.05fr)]">
        <MonthSummaryCard
          className="h-full"
          description={monthDescription}
          currentMonth={currentMonth}
          totals={totals}
          fixedTotal={fixedTotal}
          pacing={variableSpendPacing}
          showIncome={showIncome}
          monthMessage={monthMessage}
          onExportExcel={onExportExcel}
          onExportPdf={onExportPdf}
        />
        <ChartsPanel
          categoryRows={categoryRows}
          selectedSixMonthTrend={selectedSixMonthTrend}
          chartsReady={chartsReady}
          featured
          className="h-full"
          categoryCardClassName="h-full"
          showTrend={false}
        />
      </div>
      <ChartsPanel
        categoryRows={categoryRows}
        selectedSixMonthTrend={selectedSixMonthTrend}
        chartsReady={chartsReady}
        featured
        showCategories={false}
      />
    </section>
  );
}

function ChartsPanel({
  categoryRows,
  selectedSixMonthTrend,
  chartsReady,
  featured = false,
  className,
  categoryCardClassName,
  showCategories = true,
  showTrend = true,
}: {
  categoryRows: ReturnType<typeof categoryTotals>;
  selectedSixMonthTrend: ReturnType<typeof sixMonthTrend>;
  chartsReady: boolean;
  featured?: boolean;
  className?: string;
  categoryCardClassName?: string;
  showCategories?: boolean;
  showTrend?: boolean;
}) {
  const totalCategories = categoryRows.reduce((total, row) => total + row.amount, 0);
  const hasCategoryData = totalCategories > 0;
  const topCategory = categoryRows[0];
  const [showAllCategories, setShowAllCategories] = useState(false);
  const categoryPreviewLimit = 5;
  const hasHiddenCategories = featured && categoryRows.length > categoryPreviewLimit;
  const visibleCategoryRows =
    featured && !showAllCategories ? categoryRows.slice(0, categoryPreviewLimit) : categoryRows;
  const hiddenCategoryCount = Math.max(0, categoryRows.length - categoryPreviewLimit);
  const categoryProgressMax = Math.max(0, ...categoryRows.map((row) => row.amount));
  const [activeCategoryIndex, setActiveCategoryIndex] = useState<number | null>(null);
  const activeCategory =
    activeCategoryIndex === null ? null : (categoryRows[activeCategoryIndex] ?? null);
  const visibleTrendRows = selectedSixMonthTrend.filter(
    (row) => Number(row.fixed) + Number(row.variable) > 0,
  );
  const latestTrend = visibleTrendRows.at(-1);
  const latestTrendTotal = latestTrend
    ? Number(latestTrend.fixed) + Number(latestTrend.variable)
    : 0;
  const hasTrendData = visibleTrendRows.length > 0;

  return (
    <section
      className={cn(
        "grid gap-4",
        showTrend && !featured && "lg:grid-cols-1 2xl:grid-cols-2",
        className,
      )}
    >
      {showCategories && (
      <Card className={cn("finance-card overflow-hidden", categoryCardClassName)}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Categorieen</CardTitle>
              <CardDescription>Waar deze maand het geld heen ging.</CardDescription>
            </div>
            <div className="hidden rounded-[12px] border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-right sm:block">
              <p className="text-[11px] text-[var(--text-muted)]">Totaal</p>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {currency(totalCategories)}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent
          className={cn(
            "grid gap-4",
            !featured && "md:grid-cols-[0.72fr_1.28fr] lg:grid-cols-1",
          )}
        >
          <div
            className={cn(
              "relative overflow-visible",
              hasCategoryData ? (featured ? "h-40" : "h-48") : "h-36",
            )}
          >
            {chartsReady && hasCategoryData && (
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <PieChart>
                  <Pie
                    data={categoryRows}
                    dataKey="amount"
                    nameKey="name"
                    innerRadius={featured ? 54 : 48}
                    outerRadius={featured ? 78 : 70}
                    paddingAngle={3}
                    stroke="transparent"
                    onMouseEnter={(_entry, index) => setActiveCategoryIndex(index)}
                    onMouseLeave={() => setActiveCategoryIndex(null)}
                  >
                    {categoryRows.map((entry, index) => (
                      <Cell
                        key={entry.categoryId}
                        fill={entry.color}
                        onMouseEnter={() => setActiveCategoryIndex(index)}
                        onMouseLeave={() => setActiveCategoryIndex(null)}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
            {hasCategoryData ? (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <p className="max-w-24 truncate text-[11px] text-[var(--text-muted)]">
                  {activeCategory ? activeCategory.name : "Totaal"}
                </p>
                <p className="text-lg font-semibold text-[var(--text-primary)]">
                  {currency(activeCategory ? activeCategory.amount : totalCategories)}
                </p>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] text-center">
                  <p className="text-[11px] text-[var(--text-muted)]">Nog leeg</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                    {currency(0)}
                  </p>
                </div>
              </div>
            )}
          </div>
          <div className="space-y-3">
            {topCategory && (
              <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] p-3">
                <p className="text-[11px] text-[var(--text-muted)]">
                  Grootste categorie
                </p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {topCategory.name}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {currency(topCategory.amount)}
                  </p>
                </div>
              </div>
            )}
            {!hasCategoryData && (
              <p className="rounded-[14px] border border-dashed border-[var(--border)] bg-[var(--bg-surface)] p-3 text-sm leading-6 text-[var(--text-secondary)]">
                Zodra er uitgaven staan, zie je hier direct welke categorieen de maand bepalen.
              </p>
            )}
            <div className="space-y-3 px-3">
              {visibleCategoryRows.filter((row) => row.amount > 0).map((row) => {
                const overBudget = row.average > 0 && row.amount > row.average;

                return (
                  <div
                    key={row.categoryId}
                    className="grid grid-cols-[minmax(0,1fr)_5.75rem] items-end gap-3 text-xs"
                  >
                    <div className="grid min-w-0 gap-2">
                      <span className="flex min-w-0 items-center gap-2 text-[var(--text-secondary)]">
                        <span className="truncate">{row.name}</span>
                      </span>
                      <CategoryProgressBar
                        value={row.amount}
                        max={categoryProgressMax}
                        color={overBudget ? "#EF4444" : row.color}
                      />
                    </div>
                    <span
                      className={cn(
                        "justify-self-end pb-px text-right font-medium",
                        overBudget ? "text-[var(--negative)]" : "text-[var(--positive)]",
                      )}
                    >
                      {currency(row.amount)}
                    </span>
                  </div>
                );
              })}
              {hasHiddenCategories && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                  {!showAllCategories && (
                    <span>Plus {hiddenCategoryCount} kleinere categorieen.</span>
                  )}
                  <button
                    type="button"
                    aria-expanded={showAllCategories}
                    className={cn(
                      "rounded-[999px] px-2.5 py-1 font-medium transition",
                      showAllCategories
                        ? "bg-[var(--accent-light)] text-[var(--accent)]"
                        : "text-[var(--text-muted)] hover:bg-white/[0.04] hover:text-[var(--text-primary)]",
                    )}
                    onClick={() => setShowAllCategories((current) => !current)}
                  >
                    {showAllCategories ? "Minder tonen" : "Toon alles"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {showTrend && (
      <Card className="finance-card overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Laatste 6 maanden</CardTitle>
              <CardDescription>Vaste lasten en variabele uitgaven naast elkaar.</CardDescription>
            </div>
            <div className="hidden rounded-[12px] border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-right sm:block">
              <p className="text-[11px] text-[var(--text-muted)]">Deze maand</p>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {currency(latestTrendTotal)}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className={cn(hasTrendData ? (featured ? "h-72" : "h-56") : "h-44")}>
          {chartsReady && hasTrendData ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <BarChart
                data={visibleTrendRows}
                barGap={8}
                margin={{ top: 16, right: 8, bottom: 4, left: -18 }}
              >
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                  tickFormatter={(value) => `${Number(value) / 1000}k`}
                />
                <Tooltip
                  formatter={(value, name) => [
                    currency(Number(value)),
                    name === "fixed"
                      ? "Vaste lasten"
                      : name === "variable"
                        ? "Variabel"
                        : String(name),
                  ]}
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "rgba(99, 102, 241, 0.08)" }}
                />
                <Bar dataKey="fixed" fill="var(--accent)" radius={[8, 8, 3, 3]} />
                <Bar dataKey="variable" fill={VARIABLE_EXPENSE_COLOR} radius={[8, 8, 3, 3]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full flex-col justify-center gap-3">
              {visibleTrendRows.map((row, index) => (
                <div key={`${row.month}-${index}`} className="grid grid-cols-[2.5rem_1fr] items-center gap-3">
                  <span className="text-xs text-[var(--text-muted)]">{row.month}</span>
                  <div className="h-2 rounded-full bg-[var(--bg-surface)]">
                    <div className="h-full w-8 rounded-full bg-[var(--accent-light)]" />
                  </div>
                </div>
              ))}
              <p className="text-xs text-[var(--text-secondary)]">
                De trend wordt zichtbaar zodra er uitgaven in meerdere maanden staan.
              </p>
            </div>
          )}
        </CardContent>
        <div className="flex gap-3 border-t border-[var(--border)] px-5 py-3 text-xs text-[var(--text-secondary)]">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
            Vast
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#14B8A6]" />
            Variabel
          </span>
        </div>
      </Card>
      )}
    </section>
  );
}

function FixedExpenseAgenda({
  items,
  transactions,
  plannedContributions,
  currentMonth,
  message,
  highlightedId,
  skippingId,
  onSkip,
  compact = false,
}: {
  items: FixedAgendaItem[];
  transactions: Transaction[];
  plannedContributions: ContributionPlanRow[];
  currentMonth: string;
  message?: string;
  highlightedId?: string | null;
  skippingId?: string | null;
  onSkip?: (item: FixedAgendaItem) => void;
  compact?: boolean;
}) {
  const monthlyTotal = items.reduce((total, item) => total + item.amount, 0);
  const openTotal = items
    .filter(
      (item) =>
        item.state === "today" ||
        item.state === "upcoming",
    )
    .reduce((total, item) => total + item.amount, 0);
  const processedTotal = items
    .filter((item) => isProcessedAgendaState(item.state))
    .reduce((total, item) => total + item.amount, 0);
  const upcomingItems = items.filter(
    (item) =>
      item.state === "today" ||
      item.state === "upcoming",
  );
  const pastItems = items.filter((item) => isProcessedAgendaState(item.state));
  const skippedItems = items.filter((item) => item.state === "skipped");
  const timelineItems = compact
    ? upcomingItems.slice(0, 4)
    : [...upcomingItems, ...pastItems, ...skippedItems].sort(
        (first, second) =>
          first.date.localeCompare(second.date) ||
          first.name.localeCompare(second.name, "nl"),
      );

  return (
    <Card className="finance-card">
      <CardHeader className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <CardTitle>Vaste lasten agenda</CardTitle>
          <CardDescription>
            {compact
              ? "Wat er nog automatisch aankomt."
              : "Een maandbeeld van wat automatisch afgeschreven wordt."}
          </CardDescription>
        </div>
        <Badge className="w-fit border-indigo-400/25 bg-indigo-500/10 text-indigo-200">
          {monthLabel(currentMonth)}
        </Badge>
      </CardHeader>
      <CardContent className={cn("space-y-5", compact && "space-y-4")}>
        {message && (
          <p className="rounded-[12px] border border-[var(--border)] bg-[var(--bg-surface)] p-3 text-sm text-[var(--text-secondary)]">
            {message}
          </p>
        )}

        <div className={cn("grid grid-cols-3 gap-2", compact && "grid-cols-1")}>
          <AgendaTotal label="Deze maand" value={monthlyTotal} tone="indigo" />
          <AgendaTotal label="Verwerkt" value={processedTotal} tone="slate" />
          <AgendaTotal label="Nog open" value={openTotal} tone="zinc" />
        </div>

        <div
          className={cn(
            "grid gap-4",
            !compact && "lg:grid-cols-[0.9fr_1.1fr]",
          )}
        >
          {!compact && (
            <FixedExpenseCalendar
              items={items}
              transactions={transactions}
              plannedContributions={plannedContributions}
              currentMonth={currentMonth}
              highlightedId={highlightedId}
            />
          )}

          <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-surface)] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                <CalendarDays className="h-4 w-4 text-[var(--accent)]" />
                {compact ? "Eerstvolgend" : "Tijdlijn"}
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                {timelineItems.length}{" "}
                {timelineItems.length === 1 ? "vaste last" : "vaste lasten"}
              </p>
            </div>

            {timelineItems.length === 0 ? (
              <div className="rounded-[16px] border border-dashed border-[var(--border)] bg-black/10 p-4 text-sm leading-6 text-[var(--text-secondary)]">
                Nog geen actieve vaste lasten. Voeg onderaan je hypotheek,
                verzekeringen of abonnementen toe; daarna verschijnen ze hier
                automatisch op afschrijfdag.
              </div>
            ) : (
              <AgendaSection
                items={timelineItems}
                highlightedId={highlightedId}
                skippingId={skippingId}
                onSkip={onSkip}
              />
            )}
            {compact && items.length > timelineItems.length && (
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                Plus {items.length - timelineItems.length} later deze maand.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FixedExpenseCalendar({
  items,
  transactions,
  plannedContributions,
  currentMonth,
  highlightedId,
}: {
  items: FixedAgendaItem[];
  transactions: Transaction[];
  plannedContributions: ContributionPlanRow[];
  currentMonth: string;
  highlightedId?: string | null;
}) {
  const [year, monthNumber] = currentMonth.split("-").map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const firstDay = new Date(year, monthNumber - 1, 1).getDay();
  const leadingBlanks = firstDay === 0 ? 6 : firstDay - 1;
  const today = new Date().toISOString().slice(0, 10);
  const itemsByDay = new Map<number, FixedAgendaItem[]>();
  const contributionsByDay = new Map<number, CalendarTooltipItem[]>();
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<{
    key: string;
    items: CalendarTooltipItem[];
    position: {
      left: number;
      top: number;
      width: number;
    };
  } | null>(null);

  items.forEach((item) => {
    const dayItems = itemsByDay.get(item.day) ?? [];
    dayItems.push(item);
    itemsByDay.set(item.day, dayItems);
  });

  transactions
    .filter((transaction) => transaction.type === "contribution")
    .filter(
      (transaction) =>
        transaction.contributionKind === "planned" ||
        transaction.contributionKind === "extra",
    )
    .filter((transaction) => transaction.date.startsWith(currentMonth))
    .forEach((transaction) => {
      const day = Number(transaction.date.slice(8, 10));

      if (!day || day < 1 || day > daysInMonth) {
        return;
      }

      const dayItems = contributionsByDay.get(day) ?? [];
      dayItems.push({
        id: `contribution-${transaction.id}`,
        name: contributionDisplayName(transaction, true),
        amount: transaction.amount,
        color: "#10B981",
        kind: "contribution",
      });
      contributionsByDay.set(day, dayItems);
    });

  plannedContributions
    .filter((plan) => plan.remaining > 0)
    .map((plan) => ({
      plan,
      date: dateForBillingDay(currentMonth, plan.depositDay),
    }))
    .filter(({ date }) => date.startsWith(currentMonth) && date > today)
    .forEach(({ plan, date }) => {
      const day = Number(date.slice(8, 10));

      if (!day || day < 1 || day > daysInMonth) {
        return;
      }

      const dayItems = contributionsByDay.get(day) ?? [];
      dayItems.push({
        id: `planned-contribution-${plan.id}`,
        name: `${plan.label || "Reguliere storting"} — ${plan.person}`,
        amount: plan.remaining,
        color: "#10B981",
        kind: "contribution",
      });
      contributionsByDay.set(day, dayItems);
    });

  const cells = [
    ...Array.from({ length: leadingBlanks }, (_, index) => ({
      key: `blank-${index}`,
      day: null as number | null,
      fixedItems: [] as FixedAgendaItem[],
      contributionItems: [] as CalendarTooltipItem[],
      items: [] as CalendarTooltipItem[],
    })),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const fixedItems = itemsByDay.get(day) ?? [];
      const contributionItems = contributionsByDay.get(day) ?? [];

      return {
        key: `day-${day}`,
        day,
        fixedItems,
        contributionItems,
        items: [
          ...fixedItems.map((item) => ({
            id: `fixed-${item.id}`,
            name: item.name,
            amount: item.amount,
            color: item.categoryColor,
            kind: "fixed" as const,
          })),
          ...contributionItems,
        ],
      };
    }),
  ];

  function clampTooltipPosition(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  function openTooltip(cell: (typeof cells)[number], target: HTMLElement) {
    if (cell.items.length === 0) {
      return;
    }

    const rect = target.getBoundingClientRect();
    const cardRect = calendarRef.current?.getBoundingClientRect();

    if (!cardRect) {
      return;
    }

    const margin = 12;
    const width = Math.min(220, cardRect.width - margin * 2);
    const estimatedHeight = Math.min(
      cardRect.height - margin * 2,
      34 + cell.items.length * 30,
    );
    const relativeLeft = rect.left - cardRect.left;
    const relativeTop = rect.top - cardRect.top;
    const cellCenter = relativeLeft + rect.width / 2;
    const openRight = cellCenter <= cardRect.width / 2;
    const preferredLeft = openRight
      ? relativeLeft + rect.width + 8
      : relativeLeft - width - 8;
    const preferredTop = relativeTop + rect.height / 2 - estimatedHeight / 2;

    setActiveTooltip({
      key: cell.key,
      items: cell.items,
      position: {
        left: clampTooltipPosition(
          preferredLeft,
          margin,
          cardRect.width - width - margin,
        ),
        top: clampTooltipPosition(
          preferredTop,
          margin,
          cardRect.height - estimatedHeight - margin,
        ),
        width,
      },
    });
  }

  useEffect(() => {
    if (!activeTooltip) {
      return;
    }

    function closeOnOutsidePointer(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (tooltipRef.current?.contains(target)) {
        return;
      }

      if (target instanceof Element && target.closest("[data-fixed-calendar-day]")) {
        return;
      }

      setActiveTooltip(null);
    }

    function closeTooltip() {
      setActiveTooltip(null);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeTooltip();
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeTooltip);
    window.addEventListener("scroll", closeTooltip, true);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeTooltip);
      window.removeEventListener("scroll", closeTooltip, true);
    };
  }, [activeTooltip]);

  return (
    <div
      ref={calendarRef}
      className="relative z-[70] hidden overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-surface)] p-4 lg:block"
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">Kalender</p>
          <p className="text-xs text-[var(--text-secondary)]">
            Vaste lasten per dag
          </p>
        </div>
        <Badge className="border-[var(--border)] bg-[var(--accent-light)] text-[var(--accent)]">
          {monthLabel(currentMonth)}
        </Badge>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-[var(--text-muted)]">
        {["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const hasItems = cell.items.length > 0;
          const isTooltipOpen = hasItems && activeTooltip?.key === cell.key;
          const hasFixedItems = cell.fixedItems.length > 0;
          const hasContributions = cell.contributionItems.length > 0;
          const isHighlighted = cell.fixedItems.some((item) => item.id === highlightedId);
          const hasProcessed = cell.fixedItems.some((item) =>
            isProcessedAgendaState(item.state),
          );

          return (
            <div
              key={cell.key}
              data-fixed-calendar-day={hasItems ? cell.key : undefined}
              className={cn(
                "relative min-h-12 rounded-[10px] border border-transparent p-1.5 text-xs transition",
                cell.day && "hover:bg-[var(--bg-card-hover)]",
                hasFixedItems && "border-[var(--border)] bg-[var(--accent-light)]",
                hasContributions &&
                  "border-emerald-400/20 bg-emerald-500/10",
                hasFixedItems &&
                  hasContributions &&
                  "border-emerald-400/25 bg-[linear-gradient(135deg,rgba(99,102,241,0.14),rgba(16,185,129,0.14))]",
                isHighlighted && "border-[var(--accent)]",
                isTooltipOpen && "z-[80]",
              )}
              onMouseEnter={(event) => hasItems && openTooltip(cell, event.currentTarget)}
              onMouseLeave={() => setActiveTooltip(null)}
              onFocus={(event) => hasItems && openTooltip(cell, event.currentTarget)}
              onBlur={() => setActiveTooltip(null)}
              onClick={(event) => {
                if (!hasItems) {
                  return;
                }

                event.stopPropagation();

                if (isTooltipOpen) {
                  setActiveTooltip(null);
                  return;
                }

                openTooltip(cell, event.currentTarget);
              }}
              tabIndex={hasItems ? 0 : undefined}
            >
              {cell.day && (
                <>
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium text-[var(--text-secondary)]">
                      {cell.day}
                    </span>
                    {hasItems && (
                      <span className="flex items-center gap-1">
                        {hasFixedItems && (
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full bg-[var(--accent)]",
                              hasProcessed && "bg-[#64748B]",
                            )}
                          />
                        )}
                        {hasContributions && (
                          <span className="h-2 w-2 rounded-full bg-[#10B981] ring-1 ring-emerald-200/20" />
                        )}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      {activeTooltip && (
        <div
          ref={tooltipRef}
          className="pointer-events-none absolute z-[90] rounded-[12px] border border-[var(--border-strong)] bg-[#1E1E28] p-2 text-left shadow-[0_18px_45px_rgba(0,0,0,0.38)]"
          style={{
            left: activeTooltip.position.left,
            top: activeTooltip.position.top,
            width: activeTooltip.position.width,
          }}
        >
          <div className="grid gap-1.5">
            {activeTooltip.items.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate text-[11px] font-medium text-[var(--text-primary)]">
                  {item.name}
                </span>
                <span className="text-[11px] text-[var(--text-secondary)]">
                  {currency(item.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AgendaTotal({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "indigo" | "slate" | "zinc";
}) {
  return (
    <div
      className={cn(
        "rounded-[14px] border p-3",
        tone === "indigo" && "border-[var(--border-strong)] bg-[var(--accent-light)]",
        tone === "slate" && "border-[#64748B]/25 bg-[#64748B]/10",
        tone === "zinc" && "border-[var(--border)] bg-[var(--bg-surface)]",
      )}
    >
      <p className="text-[11px] font-medium uppercase text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)] sm:text-base">
        {currency(value)}
      </p>
    </div>
  );
}

function AgendaSection({
  items,
  highlightedId,
  skippingId,
  onSkip,
}: {
  items: FixedAgendaItem[];
  highlightedId?: string | null;
  skippingId?: string | null;
  onSkip?: (item: FixedAgendaItem) => void;
}) {
  return (
    <div className="relative space-y-0">
      {items.map((item) => (
        <AgendaRow
          key={item.id}
          item={item}
          isHighlighted={highlightedId === item.id}
          isSkipping={skippingId === item.id}
          onSkip={onSkip}
        />
      ))}
    </div>
  );
}

function AgendaRow({
  item,
  isHighlighted,
  isSkipping,
  onSkip,
}: {
  item: FixedAgendaItem;
  isHighlighted: boolean;
  isSkipping: boolean;
  onSkip?: (item: FixedAgendaItem) => void;
}) {
  const isProcessed = isProcessedAgendaState(item.state);
  const isSkipped = item.state === "skipped";

  return (
    <div
      className={cn(
        "relative grid grid-cols-[3rem_1fr] gap-3 py-2",
        isSkipped && "opacity-70",
      )}
    >
      <div className="relative flex flex-col items-center">
        <div
          className={cn(
            "absolute top-8 bottom-[-0.5rem] w-px bg-[var(--border)]",
            isProcessed && "bg-[#64748B] opacity-50",
          )}
        />
        <div
          className={cn(
            "z-10 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-secondary)]",
            isProcessed && "border-[#64748B]/30 bg-[#64748B]/10 text-[#64748B]",
            item.state === "today" && "border-[var(--accent)] text-[var(--accent)]",
            isHighlighted && "border-[var(--accent)] bg-[var(--accent-light)]",
          )}
        >
          {isProcessed ? <Check className="h-4 w-4" /> : item.day}
        </div>
      </div>

      <div
        className={cn(
          "rounded-[12px] border border-[var(--border)] bg-black/10 p-3 transition",
          isHighlighted && "border-[var(--accent)] bg-[var(--accent-light)]",
        )}
      >
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.categoryColor }}
              />
              <p
                className={cn(
                  "truncate text-sm font-medium text-[var(--text-primary)]",
                  isSkipped && "text-[var(--text-muted)] line-through",
                )}
              >
                {item.name}
              </p>
            </div>
            <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">
              {item.categoryName} · {agendaStateLabel(item.state)}
              {item.note ? ` · ${item.note}` : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <p
              className={cn(
                "text-sm font-semibold text-[var(--text-primary)]",
                isSkipped && "text-[var(--text-muted)] line-through",
              )}
            >
              {currency(item.amount)}
            </p>
            {item.canSkip && onSkip && !isSkipped && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onSkip(item)}
                disabled={isSkipping}
                className="h-7 px-2 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                {isSkipping ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Overslaan"
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FixedExpenseManager({
  expenses,
  categories,
  labels,
  accountName,
  name,
  amount,
  billingDay,
  startsOn,
  category,
  editingId,
  highlightedId,
  message,
  isSaving,
  defaultOpen = false,
  hideHeader = false,
  onNameChange,
  onAmountChange,
  onBillingDayChange,
  onStartsOnChange,
  onCategoryChange,
  onSave,
  onEdit,
  onDelete,
  onCancel,
}: {
  expenses: RecurringExpense[];
  categories: DashboardData["categories"];
  labels: Map<string, DashboardData["categories"][number]>;
  accountName: string;
  name: string;
  amount: string;
  billingDay: string;
  startsOn: string;
  category: string;
  editingId: string | null;
  highlightedId: string | null;
  message: string;
  isSaving: boolean;
  defaultOpen?: boolean;
  hideHeader?: boolean;
  onNameChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onBillingDayChange: (value: string) => void;
  onStartsOnChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onSave: () => void;
  onEdit: (expense: RecurringExpense) => void;
  onDelete: (expense: RecurringExpense) => void;
  onCancel: () => void;
}) {
  const [isManagerOpen, setIsManagerOpen] = useState(defaultOpen);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const activeExpenses = expenses
    .filter((expense) => expense.isActive)
    .sort((first, second) => {
      if (first.id === highlightedId) return -1;
      if (second.id === highlightedId) return 1;
      return (
        first.billingDay - second.billingDay ||
        first.name.localeCompare(second.name, "nl")
      );
    });
  const formTitle = editingId ? "Vaste last wijzigen" : "Nieuwe vaste last";
  const showManager = hideHeader || Boolean(editingId) || isManagerOpen;
  const showForm = Boolean(editingId) || isFormOpen;
  const monthlyTotal = activeExpenses.reduce(
    (total, expense) => total + expense.currentAmount,
    0,
  );

  return (
    <Card className="h-full">
      {!hideHeader && (
        <CardHeader className="grid gap-2 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <CardTitle>Vaste lasten</CardTitle>
            <CardDescription>
              Terugkerende vaste lasten op {accountName}.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {editingId && (
              <Button size="sm" variant="secondary" onClick={onCancel}>
                <X className="h-4 w-4" />
                Annuleer
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setIsManagerOpen((open) => !open)}
            >
              <Plus
                className={cn(
                  "h-4 w-4 transition",
                  showManager && "rotate-45",
                )}
              />
              {showManager ? "Sluiten" : "Beheren"}
            </Button>
          </div>
        </CardHeader>
      )}
      {showManager && (
      <CardContent className={cn("space-y-5", hideHeader && "pt-4")}>
        {message && (
          <div
            className="rounded-[12px] border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-300"
            aria-live="polite"
          >
            {message}
          </div>
        )}

        <div className="rounded-[16px] border border-zinc-800 bg-zinc-950/35 p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-100">
                Overzicht vaste lasten
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {activeExpenses.length} actief, gesorteerd op afschrijfdag
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-500">Totaal</p>
              <p className="text-xl font-semibold text-zinc-50">
                {currency(monthlyTotal)}
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            {activeExpenses.length === 0 && (
              <div className="rounded-[14px] border border-dashed border-zinc-800 bg-zinc-950/45 p-4 text-sm text-zinc-400">
                Nog geen vaste lasten toegevoegd voor deze rekening.
              </div>
            )}

            {activeExpenses.map((expense) => (
              <RecurringExpenseCard
                key={expense.id}
                expense={expense}
                categoryName={labels.get(expense.categoryId)?.name ?? "Onbekend"}
                isHighlighted={expense.id === highlightedId}
                isSaving={isSaving}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>

        <div className="rounded-[16px] border border-zinc-800 bg-zinc-950/30">
          <button
            type="button"
            onClick={() => {
              if (editingId) {
                onCancel();
                setIsFormOpen(false);
                return;
              }

              setIsFormOpen((open) => !open);
            }}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-zinc-100"
          >
            {formTitle}
            <Plus
              className={cn(
                "h-4 w-4 text-zinc-500 transition",
                showForm && "rotate-45",
              )}
            />
          </button>
          {showForm && (
          <div className="space-y-3 border-t border-zinc-900 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldLabel label="Naam">
                <Input
                  placeholder="Bijv. Hypotheek"
                  value={name}
                  className="h-10"
                  onChange={(event) => onNameChange(event.target.value)}
                />
              </FieldLabel>
              <FieldLabel label="Maandbedrag">
                <Input
                  inputMode="decimal"
                  placeholder="Bijv. 1840,00"
                  value={amount}
                  className="h-10"
                  onChange={(event) => onAmountChange(event.target.value)}
                />
              </FieldLabel>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <FieldLabel label="Categorie">
                <Select
                  value={category}
                  className="h-10"
                  onChange={(event) => onCategoryChange(event.target.value)}
                >
                  {categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </FieldLabel>
              <FieldLabel label="Afschrijfdag">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  value={billingDay}
                  className="h-10"
                  onChange={(event) => onBillingDayChange(event.target.value)}
                />
              </FieldLabel>
              <FieldLabel label="Startdatum">
                <Input
                  type="date"
                  value={startsOn}
                  className="h-10"
                  onChange={(event) => onStartsOnChange(event.target.value)}
                />
              </FieldLabel>
            </div>

            <Button className="w-full sm:w-auto" onClick={onSave} disabled={isSaving}>
              {isSaving ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {editingId ? "Wijziging opslaan" : "Vaste last toevoegen"}
            </Button>
          </div>
          )}
        </div>
      </CardContent>
      )}
    </Card>
  );
}

function PersonCostInsight({
  people,
  personTotals,
  categoryRows,
  isSharedView,
}: {
  people: string[];
  personTotals: Record<string, number>;
  categoryRows: ReturnType<typeof categoryTotalsByPerson>;
  isSharedView: boolean;
}) {
  const totalPersonSpend = people.reduce(
    (total, person) => total + (personTotals[person] ?? 0),
    0,
  );
  const title = isSharedView
    ? "Gezamenlijke uitgaven per persoon"
    : "Mijn toegevoegde uitgaven";
  const description = isSharedView
    ? "Wie voegde welke variabele kosten toe."
    : "Prive-uitgaven op deze rekening, uitgesplitst waar mogelijk.";
  const topRows = categoryRows.slice(0, 3);
  const identityPeople = ["Ralph", "Dorine"];
  const personIdentityColor = (person: string) =>
    person === "Ralph" ? "#F97316" : "#8B5CF6";

  return (
    <Card className="bg-[#141416]">
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          {people.map((person) => {
            const value = personTotals[person] ?? 0;
            const percentage =
              totalPersonSpend > 0 ? Math.round((value / totalPersonSpend) * 100) : 0;
            const personColor = personIdentityColor(person);

            return (
              <div
                key={person}
                className="rounded-[13px] border border-zinc-800/70 bg-zinc-950/35 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center">
                    <span
                      className="truncate text-sm"
                      style={{ color: personColor }}
                    >
                      {person}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-zinc-50">
                    {currency(value)}{" "}
                    <span className="text-xs font-medium text-zinc-500">
                      ({percentage}%)
                    </span>
                  </span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-900">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${percentage}%`, backgroundColor: personColor }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-2">
          {categoryRows.length === 0 && (
            <p className="rounded-[14px] border border-dashed border-zinc-800 bg-zinc-950/45 p-4 text-sm text-zinc-400">
              Nog geen variabele uitgaven om te verdelen.
            </p>
          )}

          {topRows.map((row) => {
            const visiblePeople = identityPeople.filter((person) =>
              people.includes(person),
            );
            const amountByPerson = new Map(
              row.people.map((personRow) => [personRow.person, personRow.amount]),
            );

            return (
              <div
                key={row.categoryId}
                className="grid gap-2 rounded-[13px] border border-zinc-800/60 bg-zinc-950/25 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: row.color }}
                    />
                    <p className="truncate text-sm font-medium text-zinc-100">
                      {row.name}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-zinc-50">
                    {currency(row.total)}
                  </p>
                </div>
                <div className="grid gap-1.5">
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-zinc-950">
                    {visiblePeople.map((person) => {
                      const amount = amountByPerson.get(person) ?? 0;

                      if (amount <= 0) {
                        return null;
                      }

                      return (
                        <div
                          key={person}
                          className="h-full"
                          style={{
                            width: `${(amount / Math.max(row.total, 1)) * 100}%`,
                            backgroundColor: personIdentityColor(person),
                          }}
                        />
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs font-medium">
                    {people.includes("Ralph") ? (
                      <span className="truncate" style={{ color: personIdentityColor("Ralph") }}>
                        {(amountByPerson.get("Ralph") ?? 0) > 0
                          ? currency(amountByPerson.get("Ralph") ?? 0)
                          : ""}
                      </span>
                    ) : (
                      <span />
                    )}
                    {people.includes("Dorine") ? (
                      <span
                        className="truncate text-right"
                        style={{ color: personIdentityColor("Dorine") }}
                      >
                        {(amountByPerson.get("Dorine") ?? 0) > 0
                          ? currency(amountByPerson.get("Dorine") ?? 0)
                          : ""}
                      </span>
                    ) : (
                      <span />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryProgressBar({
  value,
  max,
  color,
  className,
}: {
  value: number;
  max: number;
  color: string;
  className?: string;
}) {
  const width = Math.min(100, Math.max(0, (value / Math.max(max, 1)) * 100));

  return (
    <div
      className={cn("h-2.5 overflow-hidden rounded-full bg-zinc-950", className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemax={max}
      aria-valuemin={0}
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${width}%`, backgroundColor: color }}
      />
    </div>
  );
}

function RecurringExpenseCard({
  expense,
  categoryName,
  isHighlighted,
  isSaving,
  onEdit,
  onDelete,
}: {
  expense: RecurringExpense;
  categoryName: string;
  isHighlighted: boolean;
  isSaving: boolean;
  onEdit: (expense: RecurringExpense) => void;
  onDelete: (expense: RecurringExpense) => void;
}) {
  return (
    <div
      className={cn(
        "rounded-[12px] border border-zinc-800/80 bg-zinc-950/35 px-3 py-2.5 transition",
        isHighlighted &&
          "border-indigo-400/70 bg-indigo-500/10 shadow-[0_0_0_1px_rgba(99,102,241,0.22)]",
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-100">
            {expense.name}
          </p>
          <p className="mt-1 truncate text-xs text-zinc-500">
            Dag {expense.billingDay} · {categoryName} · vanaf {expense.startsOn}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {isHighlighted && (
            <Badge className="border-indigo-400/25 bg-indigo-500/10 text-indigo-200">
              net bijgewerkt
            </Badge>
          )}
          <Badge className="border-emerald-400/20 bg-emerald-500/10 text-emerald-300">
            actief
          </Badge>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-semibold text-zinc-50">
          {currency(expense.currentAmount)}
        </p>
        <div className="flex gap-2">
          <Button
            size="icon"
            variant="secondary"
            title="Wijzig vaste last"
            onClick={() => onEdit(expense)}
            disabled={isSaving}
            className="h-8 w-8"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title="Verwijder vanaf nu"
            onClick={() => onDelete(expense)}
            disabled={isSaving}
            className="h-8 w-8 text-zinc-500 hover:text-red-300"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function AccountBalanceCard({
  accountName,
  snapshot,
  labels,
  balanceAmount,
  balanceDate,
  balanceMessage,
  isSavingBalance,
  incomeTransactions,
  incomeAmount,
  incomeDate,
  incomeKind,
  incomeNote,
  incomeMessage,
  isSavingIncome,
  deletingTransactionId,
  showIncomeForm,
  coverage,
  onBalanceAmountChange,
  onBalanceDateChange,
  onSaveBalance,
  onDeleteBalance,
  onEditIncome,
  onDeleteIncome,
  onIncomeAmountChange,
  onIncomeDateChange,
  onIncomeKindChange,
  onIncomeNoteChange,
  onAddIncome,
}: {
  accountName: string;
  snapshot?: AccountBalanceSnapshot;
  labels: Map<string, DashboardData["categories"][number]>;
  balanceAmount: string;
  balanceDate: string;
  balanceMessage: string;
  isSavingBalance: boolean;
  incomeTransactions: Transaction[];
  incomeAmount: string;
  incomeDate: string;
  incomeKind: "salary" | "extra";
  incomeNote: string;
  incomeMessage: string;
  isSavingIncome: boolean;
  deletingTransactionId: string | null;
  showIncomeForm: boolean;
  coverage?: ContributionCoverageResult;
  onBalanceAmountChange: (value: string) => void;
  onBalanceDateChange: (value: string) => void;
  onSaveBalance: () => void;
  onDeleteBalance: (snapshot: AccountBalanceSnapshot) => void;
  onEditIncome: (transaction: Transaction) => void;
  onDeleteIncome: (transaction: Transaction) => void;
  onIncomeAmountChange: (value: string) => void;
  onIncomeDateChange: (value: string) => void;
  onIncomeKindChange: (value: "salary" | "extra") => void;
  onIncomeNoteChange: (value: string) => void;
  onAddIncome: () => void;
}) {
  return (
    <Card className="finance-card">
      <CardHeader>
        <CardTitle>{showIncomeForm ? "Saldo & inkomen" : "Saldo"}</CardTitle>
        <CardDescription>{accountName}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-[13px] border border-zinc-800/70 bg-zinc-950/35 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-100">
                {snapshot ? currency(snapshot.balance) : "Geen startsaldo"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {snapshot
                  ? `Ingevuld op ${snapshot.snapshotDate}`
                  : "Vul het huidige saldo in als startpunt."}
              </p>
            </div>
            {snapshot && (
              <div className="flex items-center gap-2">
                <Badge className="border-zinc-800 bg-zinc-950/70 text-zinc-400">
                  {snapshot.enteredBy}
                </Badge>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title="Saldo-invoer verwijderen"
                  onClick={() => onDeleteBalance(snapshot)}
                  disabled={isSavingBalance}
                  className="h-8 w-8 text-zinc-500 hover:text-red-300"
                >
                  {isSavingBalance ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>

        {coverage && (
          <ContributionCoverageCard coverage={coverage} showSavingsIndicator />
        )}

        <details className="group rounded-[14px] border border-zinc-800 bg-zinc-950/30">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium text-zinc-100">
            Saldo aanpassen
            <Plus className="h-4 w-4 text-zinc-500 transition group-open:rotate-45" />
          </summary>
          <div className="grid gap-2 border-t border-zinc-900 p-3">
            <Input
              inputMode="decimal"
              placeholder="Huidig saldo"
              value={balanceAmount}
              className="h-10"
              onChange={(event) => onBalanceAmountChange(event.target.value)}
            />
            <Input
              type="date"
              value={balanceDate}
              className="h-10"
              onChange={(event) => onBalanceDateChange(event.target.value)}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="secondary"
                onClick={onSaveBalance}
                disabled={isSavingBalance}
              >
                {isSavingBalance ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Bewaar
              </Button>
            </div>
          </div>
        </details>

        {balanceMessage && (
          <p className="rounded-[12px] border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-300">
            {balanceMessage}
          </p>
        )}

        {showIncomeForm && (
          <details className="group rounded-[14px] border border-emerald-400/15 bg-emerald-500/5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium text-emerald-100">
              Inkomen
              <Plus className="h-4 w-4 text-emerald-300 transition group-open:rotate-45" />
            </summary>
            <div className="grid gap-2 border-t border-emerald-400/10 p-3">
              <div className="grid grid-cols-[1fr_8rem] gap-2">
                <Input
                  inputMode="decimal"
                  placeholder="Bedrag"
                  value={incomeAmount}
                  className="h-10"
                  onChange={(event) => onIncomeAmountChange(event.target.value)}
                />
                <Select
                  value={incomeKind}
                  className="h-10"
                  onChange={(event) =>
                    onIncomeKindChange(event.target.value as "salary" | "extra")
                  }
                >
                  <option value="salary">Vast inkomen</option>
                  <option value="extra">Extra inkomen</option>
                </Select>
              </div>
              <Input
                type="date"
                value={incomeDate}
                className="h-10"
                onChange={(event) => onIncomeDateChange(event.target.value)}
              />
              <Input
                placeholder="Notitie optioneel"
                value={incomeNote}
                className="h-10"
                onChange={(event) => onIncomeNoteChange(event.target.value)}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={onAddIncome}
                  disabled={isSavingIncome}
                  className="border-emerald-400/20 text-emerald-200 hover:border-emerald-400/30 hover:bg-emerald-500/10"
                >
                  {isSavingIncome ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowDownToLine className="h-4 w-4" />
                  )}
                  Toevoegen
                </Button>
              </div>
            </div>
          </details>
        )}

        {showIncomeForm && incomeTransactions.length > 0 && (
          <div className="overflow-hidden rounded-[14px] border border-emerald-400/15 bg-emerald-500/5">
            <div className="flex items-center justify-between gap-3 border-b border-emerald-400/10 px-3 py-2.5">
              <p className="text-sm font-medium text-emerald-100">
                Inkomen deze maand
              </p>
              <span className="text-xs text-zinc-500">
                {incomeTransactions.length}
              </span>
            </div>
            <div className="divide-y divide-emerald-400/10">
              {incomeTransactions.map((transaction) => {
                const isDeleting = deletingTransactionId === transaction.id;
                const label = labels.get(transaction.categoryId)?.name ?? "Inkomen";
                const meta = [transaction.date, transaction.note]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <div
                    key={transaction.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-100">
                        {label}
                      </p>
                      {meta && (
                        <p className="mt-0.5 truncate text-xs text-zinc-500">
                          {meta}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <p className="whitespace-nowrap text-sm font-semibold text-[var(--positive)]">
                        +{preciseCurrency(transaction.amount)}
                      </p>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Wijzig inkomen"
                        onClick={() => onEditIncome(transaction)}
                        className="h-8 w-8 shrink-0 text-zinc-500 hover:text-[var(--accent)]"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Verwijder inkomen"
                        disabled={isDeleting}
                        onClick={() => onDeleteIncome(transaction)}
                        className="h-8 w-8 shrink-0 text-zinc-500 hover:text-red-300"
                      >
                        {isDeleting ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {incomeMessage && (
          <p className="rounded-[12px] border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-300">
            {incomeMessage}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function BankAppsCard() {
  return (
    <Card className="finance-card hidden lg:block">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Bankieren</CardTitle>
        <CardDescription>
          Open je bankwebsite om saldo of vaste lasten te controleren.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <a
            href="https://www.ing.nl/particulier/"
            target="_blank"
            rel="noreferrer"
            className="accent-glow-hover inline-flex h-12 items-center justify-between gap-3 rounded-[var(--radius-btn)] border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-left text-sm font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-card-hover)]"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#ff6200] text-[10px] font-bold tracking-normal text-white shadow-[0_8px_22px_rgba(0,0,0,0.22)]">
                ING
              </span>
              <span className="truncate">ING</span>
            </span>
            <Globe className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
          </a>
          <a
            href="https://www.abnamro.nl/nl/prive/"
            target="_blank"
            rel="noreferrer"
            className="accent-glow-hover inline-flex h-12 items-center justify-between gap-3 rounded-[var(--radius-btn)] border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-left text-sm font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-card-hover)]"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[linear-gradient(135deg,#008578_0%,#008578_58%,#f6c343_58%,#f6c343_100%)] text-[10px] font-bold tracking-normal text-white shadow-[0_8px_22px_rgba(0,0,0,0.22)]">
                ABN
              </span>
              <span className="truncate">ABN</span>
            </span>
            <Globe className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

function ExportCenterCard({
  accountName,
  currentMonth,
  receiptCount,
  onOpenExport,
}: {
  accountName: string;
  currentMonth: string;
  receiptCount: number;
  onOpenExport: () => void;
}) {
  return (
    <Card className="finance-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Export</CardTitle>
            <CardDescription>
              Download Excel, PDF maandrapport of bonnen vanaf een vaste plek.
            </CardDescription>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-[var(--border)] bg-[var(--accent-light)] text-[var(--accent)]">
            <FileSpreadsheet className="h-5 w-5" />
          </span>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-2 rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[var(--text-secondary)]">Rekening</span>
            <span className="truncate font-medium text-[var(--text-primary)]">
              {accountName}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[var(--text-secondary)]">Actieve maand</span>
            <span className="font-medium text-[var(--text-primary)]">
              {monthLabel(currentMonth)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[var(--text-secondary)]">Bonnen deze maand</span>
            <span className="font-medium text-[var(--text-primary)]">
              {receiptCount}
            </span>
          </div>
        </div>
        <Button
          type="button"
          className="accent-glow-hover h-11 justify-center"
          onClick={onOpenExport}
        >
          <ArrowDownToLine className="h-4 w-4" />
          Export openen
        </Button>
      </CardContent>
    </Card>
  );
}

function ExportDialog({
  currentMonth,
  monthOptions,
  transactions,
  onClose,
  onExportExcel,
  onExportPdf,
  onDownloadReceipts,
  onExportExcelRange,
  onDownloadReceiptRange,
}: {
  currentMonth: string;
  monthOptions: MonthOption[];
  transactions: Transaction[];
  onClose: () => void;
  onExportExcel: (month: string) => void;
  onExportPdf: (month: string) => Promise<void>;
  onDownloadReceipts: (month: string) => Promise<void>;
  onExportExcelRange: (fromMonth: string, toMonth: string) => void;
  onDownloadReceiptRange: (fromMonth: string, toMonth: string) => Promise<void>;
}) {
  const [exportMode, setExportMode] = useState<"month" | "range">("month");
  const [exportMonth, setExportMonth] = useState(currentMonth);
  const [fromMonth, setFromMonth] = useState(currentMonth);
  const [toMonth, setToMonth] = useState(currentMonth);
  const [isExporting, setIsExporting] = useState(false);
  const [rangeFrom, rangeTo] = normalizeMonthRange(fromMonth, toMonth);
  const receiptCount =
    exportMode === "month"
      ? transactions.filter(
          (transaction) =>
            transaction.date.startsWith(exportMonth) && transaction.receiptUrl,
        ).length
      : transactions.filter(
          (transaction) =>
            monthInRange(transaction.date.slice(0, 7), rangeFrom, rangeTo) &&
            transaction.receiptUrl,
        ).length;

  async function runExport(action: "excel" | "pdf" | "receipts") {
    setIsExporting(true);

    try {
      if (action === "excel") {
        if (exportMode === "month") {
          onExportExcel(exportMonth);
        } else {
          onExportExcelRange(rangeFrom, rangeTo);
        }
      } else if (action === "pdf") {
        await onExportPdf(exportMonth);
      } else {
        if (exportMode === "month") {
          await onDownloadReceipts(exportMonth);
        } else {
          await onDownloadReceiptRange(rangeFrom, rangeTo);
        }
      }

      onClose();
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-end bg-black/70 p-3 backdrop-blur-xl sm:place-items-center sm:p-6">
      <div className="w-full max-w-sm rounded-[24px] border border-[var(--border-strong)] bg-[var(--bg-card)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-base font-semibold text-[var(--text-primary)]">
              Exporteren
            </p>
            <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">
              Kies de maand en daarna het bestand dat je nodig hebt.
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            title="Sluiten"
            className="h-8 w-8 shrink-0 text-[var(--text-secondary)]"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-1 rounded-[var(--radius-chip)] bg-[var(--bg-surface)] p-1">
          {(["month", "range"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setExportMode(mode)}
              className={cn(
                "rounded-[var(--radius-chip)] px-3 py-2 text-sm font-medium",
                exportMode === mode
                  ? "bg-[var(--accent-light)] text-[var(--accent)]"
                  : "text-[var(--text-secondary)]",
              )}
            >
              {mode === "month" ? "Een maand" : "Periode"}
            </button>
          ))}
        </div>

        {exportMode === "month" ? (
          <div className="mt-4">
            <FieldLabel label="Maand">
              <Select
                value={exportMonth}
                onChange={(event) => setExportMonth(event.target.value)}
                className="h-11"
              >
                {monthOptions.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </Select>
            </FieldLabel>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <FieldLabel label="Van maand">
              <Select
                value={fromMonth}
                onChange={(event) => setFromMonth(event.target.value)}
                className="h-11"
              >
                {monthOptions.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </Select>
            </FieldLabel>
            <FieldLabel label="Tot maand">
              <Select
                value={toMonth}
                onChange={(event) => setToMonth(event.target.value)}
                className="h-11"
              >
                {monthOptions.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </Select>
            </FieldLabel>
          </div>
        )}

        <div className="mt-4 grid gap-2">
          <Button
            type="button"
            onClick={() => void runExport("excel")}
            disabled={isExporting}
            className="h-11 justify-center rounded-[var(--radius-btn)]"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {exportMode === "month" ? "Excel" : "Excel periode"}
          </Button>
          {exportMode === "month" ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void runExport("pdf")}
              disabled={isExporting}
              className="h-11 justify-center rounded-[var(--radius-btn)]"
            >
              <ArrowDownToLine className="h-4 w-4" />
              PDF maandrapport
            </Button>
          ) : (
            <p className="rounded-[12px] border border-[var(--border)] bg-[var(--bg-surface)] p-3 text-xs leading-5 text-[var(--text-secondary)]">
              PDF blijft per maand, zodat het printbaar en overzichtelijk blijft.
            </p>
          )}
          {receiptCount > 0 && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void runExport("receipts")}
              disabled={isExporting}
              className="h-11 justify-center rounded-[var(--radius-btn)]"
            >
              <ReceiptText className="h-4 w-4" />
              Bonnen ZIP ({receiptCount})
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ContributionCard({
  accountName,
  showPlanning = true,
  amount,
  date,
  kind,
  note,
  paidById,
  person,
  householdMembers,
  plans,
  planDrafts,
  newPlanDrafts,
  planMessage,
  savingPlanId,
  plannedTotal,
  receivedTotal,
  extraTotal,
  taxReturnTotal,
  remainingTotal,
  breakdown,
  coverage,
  message,
  isSaving,
  onAmountChange,
  onDateChange,
  onKindChange,
  onPaidByChange,
  onNoteChange,
  onPlanDraftChange,
  onNewPlanDraftChange,
  onPlanSave,
  onPlanCreate,
  onSubmit,
}: {
  accountName: string;
  showPlanning?: boolean;
  amount: string;
  date: string;
  kind: ContributionKind;
  note: string;
  paidById: string;
  person: string;
  householdMembers: DashboardData["householdMembers"];
  plans: Array<
    ContributionPlan & {
      received: number;
      remaining: number;
    }
  >;
  planDrafts: Record<string, ContributionPlanDraft>;
  newPlanDrafts: Record<string, ContributionPlanDraft>;
  planMessage: string;
  savingPlanId: string | null;
  plannedTotal: number;
  receivedTotal: number;
  extraTotal: number;
  taxReturnTotal: number;
  remainingTotal: number;
  breakdown: ContributionPersonBreakdown[];
  coverage?: ContributionCoverageResult;
  message: string;
  isSaving: boolean;
  onAmountChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onKindChange: (value: ContributionKind) => void;
  onPaidByChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onPlanDraftChange: (
    planId: string,
    field: keyof ContributionPlanDraft,
    value: string,
  ) => void;
  onNewPlanDraftChange: (
    userId: string,
    field: keyof ContributionPlanDraft,
    value: string,
  ) => void;
  onPlanSave: (plan: ContributionPlan) => void;
  onPlanCreate: (member: DashboardData["householdMembers"][number]) => void;
  onSubmit: () => boolean | Promise<boolean>;
}) {
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const plansByPerson = householdMembers.map((member) => ({
    member,
    plans: plans
      .filter((plan) => plan.userId === member.userId)
      .sort(
        (first, second) =>
          first.depositDay - second.depositDay ||
          first.label.localeCompare(second.label, "nl"),
      ),
  }));

  return (
    <Card className="finance-card h-full">
      <CardHeader>
        <CardTitle>Stortingen</CardTitle>
        <CardDescription>
          {showPlanning
            ? "Wat er deze maand op de gezamenlijke rekening binnenkomt."
            : `Losse stortingen op ${accountName}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-[16px] border border-[var(--border)] bg-[linear-gradient(135deg,#191924,#13131C)] p-4">
          <p className="text-xs font-medium text-[var(--text-secondary)]">
            Gestort deze maand
          </p>
          <p className="mt-2 text-4xl font-bold tracking-normal text-[var(--text-primary)] lg:text-[32px]">
            {currency(receivedTotal)}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            {showPlanning ? (
              <>
                <span className="text-[var(--text-secondary)]">
                  Geplande stortingen {currency(plannedTotal)}
                </span>
                <span
                  className={cn(
                    "text-right",
                    remainingTotal > 0
                      ? "text-[var(--accent)]"
                      : "text-[var(--positive)]",
                  )}
                >
                  Nog {currency(remainingTotal)}
                </span>
              </>
            ) : (
              <span className="col-span-2 text-[var(--text-secondary)]">
                Losse stortingen op {accountName}
              </span>
            )}
          </div>
        </div>

        {showPlanning && (
          <div className="divide-y divide-[var(--border)] rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)]">
            {plansByPerson.map(({ member, plans: personPlans }) => (
              <div key={member.userId} className="space-y-2 px-3 py-2.5">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {member.displayName}
                </p>
                <div className="space-y-1.5">
                  {personPlans.map((plan) => {
                    const isComplete = plan.remaining <= 0;

                    return (
                      <div
                        key={plan.id}
                        className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-[10px] bg-black/10 px-2.5 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-[var(--text-primary)]">
                            {plan.label}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-[var(--text-secondary)]">
                            {currency(plan.monthlyAmount)} · dag {plan.depositDay} · {currency(plan.received)} binnen
                          </p>
                        </div>
                        <Badge
                          className={cn(
                            "border-[var(--border)] bg-black/10 text-[var(--text-secondary)]",
                            isComplete &&
                              "border-emerald-400/20 bg-[var(--positive-light)] text-[var(--positive)]",
                          )}
                        >
                          {isComplete ? currency(plan.received) : currency(plan.remaining)}
                        </Badge>
                      </div>
                    );
                  })}
                  {personPlans.length === 0 && (
                    <p className="rounded-[10px] bg-black/10 px-2.5 py-2 text-xs text-[var(--text-secondary)]">
                      Nog geen geplande storting.
                    </p>
                  )}
                </div>
              </div>
            ))}
            {plans.length === 0 && (
              <p className="p-3 text-sm text-[var(--text-secondary)]">
                Geplande stortingen verschijnen zodra Supabase chunk 20 is uitgevoerd.
              </p>
            )}
          </div>
        )}

        {showPlanning && <ContributionBreakdownList people={breakdown} />}

        <div className="grid grid-cols-2 gap-2 text-sm">
          {showPlanning && (
            <ContributionStat
              label="Nog verwacht"
              value={currency(remainingTotal)}
              tone={remainingTotal > 0 ? "indigo" : "emerald"}
            />
          )}
          <ContributionStat
            label="Extra stortingen"
            value={currency(extraTotal)}
            tone={extraTotal > 0 ? "emerald" : "zinc"}
          />
          {coverage && <ContributionCoverageCard coverage={coverage} />}
        </div>

        {showPlanning && planMessage && (
          <p className="rounded-[12px] border border-[var(--border)] bg-[var(--bg-surface)] p-3 text-sm text-[var(--text-secondary)]">
            {planMessage}
          </p>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="secondary"
            className="h-10 w-full justify-center border-emerald-400/20 text-emerald-200 hover:border-emerald-400/30 hover:bg-emerald-500/10 sm:col-span-2"
            onClick={() => {
              if (kind === "planned") {
                onKindChange("extra");
              }
              setIsBookingOpen(true);
            }}
          >
            <ArrowDownToLine className="h-4 w-4" />
            Storting toevoegen
          </Button>
        </div>

        {showPlanning && (
          <details className="group rounded-[14px] border border-[var(--border)] bg-black/10">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium text-[var(--text-primary)]">
              Geplande storting instellen
              <Plus className="h-4 w-4 text-[var(--text-muted)] transition group-open:rotate-45" />
            </summary>
            <div className="grid gap-3 border-t border-[var(--border)] p-3">
              {plansByPerson.map(({ member, plans: personPlans }) => {
                const newDraft = newPlanDrafts[member.userId] ?? {
                  label: "",
                  amount: "",
                  depositDay: "1",
                };
                const isSavingNewPlan = savingPlanId === `new:${member.userId}`;

                return (
                  <div
                    key={member.userId}
                    className="grid gap-2 rounded-[12px] bg-[var(--bg-surface)] p-2"
                  >
                    <p className="text-xs font-medium text-[var(--text-secondary)]">
                      {member.displayName}
                    </p>
                    {personPlans.map((plan) => {
                      const draft = planDrafts[plan.id] ?? {
                        label: plan.label,
                        amount: String(plan.monthlyAmount || ""),
                        depositDay: String(plan.depositDay),
                      };
                      const isSavingPlan = savingPlanId === plan.id;

                      return (
                        <div
                          key={plan.id}
                          className="grid gap-2 rounded-[10px] bg-black/10 p-2"
                        >
                          <Input
                            value={draft.label}
                            placeholder="Naam"
                            className="h-9"
                            onChange={(event) =>
                              onPlanDraftChange(plan.id, "label", event.target.value)
                            }
                          />
                          <div className="grid grid-cols-[1fr_6.2rem_auto] gap-2">
                            <Input
                              inputMode="decimal"
                              value={draft.amount}
                              placeholder="Maandbedrag"
                              className="h-9"
                              onChange={(event) =>
                                onPlanDraftChange(plan.id, "amount", event.target.value)
                              }
                            />
                            <Select
                              value={draft.depositDay}
                              className="h-9"
                              aria-label={`Stortdag ${plan.label}`}
                              onChange={(event) =>
                                onPlanDraftChange(plan.id, "depositDay", event.target.value)
                              }
                            >
                              {Array.from({ length: 31 }, (_, index) => index + 1).map(
                                (day) => (
                                  <option key={day} value={day}>
                                    Dag {day}
                                  </option>
                                ),
                              )}
                            </Select>
                            <Button
                              size="icon"
                              variant="secondary"
                              title={`${plan.label} bewaren`}
                              className="h-9 w-9"
                              disabled={isSavingPlan}
                              onClick={() => onPlanSave(plan)}
                            >
                              {isSavingPlan ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    <div className="grid gap-2 rounded-[10px] border border-dashed border-[var(--border)] p-2">
                      <Input
                        value={newDraft.label}
                        placeholder="Nieuwe planning"
                        className="h-9"
                        onChange={(event) =>
                          onNewPlanDraftChange(member.userId, "label", event.target.value)
                        }
                      />
                      <div className="grid grid-cols-[1fr_6.2rem_auto] gap-2">
                        <Input
                          inputMode="decimal"
                          value={newDraft.amount}
                          placeholder="Bedrag"
                          className="h-9"
                          onChange={(event) =>
                            onNewPlanDraftChange(member.userId, "amount", event.target.value)
                          }
                        />
                        <Select
                          value={newDraft.depositDay}
                          className="h-9"
                          aria-label={`Nieuwe stortdag ${member.displayName}`}
                          onChange={(event) =>
                            onNewPlanDraftChange(member.userId, "depositDay", event.target.value)
                          }
                        >
                          {Array.from({ length: 31 }, (_, index) => index + 1).map(
                            (day) => (
                              <option key={day} value={day}>
                                Dag {day}
                              </option>
                            ),
                          )}
                        </Select>
                        <Button
                          size="icon"
                          variant="secondary"
                          title={`Planning voor ${member.displayName} toevoegen`}
                          className="h-9 w-9"
                          disabled={isSavingNewPlan}
                          onClick={() => onPlanCreate(member)}
                        >
                          {isSavingNewPlan ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        )}

        {message && (
          <p className="rounded-[12px] border border-[var(--border)] bg-[var(--bg-surface)] p-3 text-sm text-[var(--text-secondary)]">
            {message}
          </p>
        )}
        <ContributionBookingDialog
          open={isBookingOpen}
          amount={amount}
          date={date}
          kind={kind}
          note={note}
          paidById={paidById}
          person={person}
          accountName={accountName}
          householdMembers={householdMembers}
          isSaving={isSaving}
          message={message}
          onAmountChange={onAmountChange}
          onDateChange={onDateChange}
          onKindChange={onKindChange}
          onNoteChange={onNoteChange}
          onPaidByChange={onPaidByChange}
          onClose={() => setIsBookingOpen(false)}
          onSubmit={onSubmit}
        />
      </CardContent>
    </Card>
  );
}

function ContributionBookingDialog({
  open,
  amount,
  date,
  kind,
  note,
  paidById,
  person,
  accountName,
  householdMembers,
  isSaving,
  message,
  onAmountChange,
  onDateChange,
  onKindChange,
  onNoteChange,
  onPaidByChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  amount: string;
  date: string;
  kind: ContributionKind;
  note: string;
  paidById: string;
  person: string;
  accountName: string;
  householdMembers: DashboardData["householdMembers"];
  isSaving: boolean;
  message: string;
  onAmountChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onKindChange: (value: ContributionKind) => void;
  onNoteChange: (value: string) => void;
  onPaidByChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => boolean | Promise<boolean>;
}) {
  if (!open) {
    return null;
  }

  async function handleSubmit() {
    const saved = await onSubmit();

    if (saved) {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-end bg-black/75 p-0 backdrop-blur-xl sm:place-items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Storting toevoegen"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-[24px] border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-2xl sm:max-w-md sm:rounded-[24px] sm:p-5"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Storting toevoegen
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Losse storting op {accountName}.
            </p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-9 w-9 text-[var(--text-muted)]"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <p className="text-xs font-medium text-zinc-500">Van wie?</p>
            <div className="grid grid-cols-2 gap-2">
              {householdMembers.map((member) => {
                const isActive = paidById === member.userId;

                return (
                  <button
                    key={member.userId}
                    type="button"
                    onClick={() => onPaidByChange(member.userId)}
                    className={cn(
                      "rounded-[var(--radius-btn)] border px-3 py-2 text-sm font-medium transition",
                      isActive
                        ? "border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent)]"
                        : "border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]",
                    )}
                  >
                    {member.displayName}
                  </button>
                );
              })}
            </div>
          </div>

          <FieldLabel label="Bedrag">
            <Input
              inputMode="decimal"
              placeholder="Bedrag"
              value={amount}
              className="h-12 text-lg font-semibold"
              onChange={(event) => onAmountChange(event.target.value)}
            />
          </FieldLabel>

          <FieldLabel label="Datum">
            <Input
              type="date"
              value={date}
              className="finance-mobile-date-anchor h-10"
              onChange={(event) => onDateChange(event.target.value)}
            />
          </FieldLabel>

          <div className="grid gap-2">
            <p className="text-xs font-medium text-zinc-500">Type</p>
            <div className="grid grid-cols-2 gap-1 rounded-[16px] bg-[var(--bg-surface)] p-1">
              {(["extra", "belastingteruggave"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => onKindChange(item)}
                  className={cn(
                    "rounded-[var(--radius-chip)] px-2 py-2 text-[11px] font-medium sm:text-xs",
                    kind === item
                      ? "bg-[var(--accent-light)] text-[var(--accent)]"
                      : "text-[var(--text-secondary)] hover:bg-white/[0.04]",
                  )}
                >
                  {contributionKindLabel(item)}
                </button>
              ))}
            </div>
          </div>

          <FieldLabel label="Notitie">
            <Input
              placeholder={`Optioneel, bijv. storting ${person}`}
              value={note}
              className="h-10"
              onChange={(event) => onNoteChange(event.target.value)}
            />
          </FieldLabel>

          {message && (
            <p className="rounded-[12px] border border-[var(--border)] bg-[var(--bg-surface)] p-3 text-sm text-[var(--text-secondary)]">
              {message}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              className="h-11"
              onClick={onClose}
            >
              Annuleren
            </Button>
            <Button
              type="button"
              className="accent-glow-hover h-11"
              disabled={isSaving}
              onClick={() => void handleSubmit()}
            >
              {isSaving ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowDownToLine className="h-4 w-4" />
              )}
              Opslaan
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContributionStat({
  label,
  value,
  tone = "zinc",
  className,
}: {
  label: string;
  value: string;
  tone?: "zinc" | "indigo" | "emerald" | "red";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[12px] border bg-black/10 p-2.5",
        tone === "zinc" && "border-[var(--border)]",
        tone === "indigo" && "border-[var(--border-strong)] bg-[var(--accent-light)]",
        tone === "emerald" && "border-emerald-400/20 bg-[var(--positive-light)]",
        tone === "red" && "border-red-400/25 bg-[var(--negative-light)]",
        className,
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-normal text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
        {value}
      </p>
    </div>
  );
}

function ContributionBreakdownList({
  people,
}: {
  people: ContributionPersonBreakdown[];
}) {
  if (people.length === 0) {
    return null;
  }

  return (
    <div className="rounded-[14px] border border-[var(--border)] bg-black/10 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-normal text-[var(--text-muted)]">
          Per persoon
        </p>
        <p className="text-[11px] text-[var(--text-secondary)]">
          per stortingstype
        </p>
      </div>
      <div className="grid gap-3">
        {people.map((person) => (
          <div key={person.person} className="grid gap-2">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {person.person}
            </p>
            <ContributionBreakdownRows
              label="Reguliere storting"
              rows={person.planned}
              emptyText="Nog niet gestort"
            />
            <ContributionBreakdownRows
              label="Extra stortingen"
              rows={person.extra}
              emptyText="Geen extra storting"
              hideWhenEmpty
            />
            <ContributionBreakdownRows
              label={`Belastingteruggave — ${person.person}`}
              rows={person.taxReturn}
              emptyText="Geen belastingteruggave"
              hideWhenEmpty
            />
            <ContributionBreakdownRows
              label="Storting"
              rows={person.unknown}
              emptyText="Geen onbekende storting"
              hideWhenEmpty
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ContributionBreakdownRows({
  label,
  rows,
  emptyText,
  hideWhenEmpty = false,
}: {
  label: string;
  rows: Array<{
    id: string;
    date: string;
    amount: number;
  }>;
  emptyText: string;
  hideWhenEmpty?: boolean;
}) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  if (hideWhenEmpty && rows.length === 0) {
    return null;
  }

  return (
    <div className="rounded-[12px] border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--text-secondary)]">{label}</p>
        <p className="text-xs font-semibold text-[var(--positive)]">
          {currency(total)}
        </p>
      </div>
      <div className="mt-1 grid gap-1">
        {rows.length > 0 ? (
          rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-3 text-[11px] text-[var(--text-muted)]"
            >
              <span>{row.date}</span>
              <span>{currency(row.amount)}</span>
            </div>
          ))
        ) : (
          <p className="text-[11px] text-[var(--text-muted)]">{emptyText}</p>
        )}
      </div>
    </div>
  );
}

function ContributionCoverageCard({
  coverage,
  showSavingsIndicator = false,
}: {
  coverage: ContributionCoverageResult;
  showSavingsIndicator?: boolean;
}) {
  const savingsTone =
    coverage.tone === "zinc"
      ? "zinc"
      : coverage.amount > 0
        ? "emerald"
        : "amber";
  const savingsText =
    savingsTone === "zinc"
      ? "Nog te vroeg om investeringsruimte te berekenen"
      : savingsTone === "emerald"
        ? `Ruimte om te sparen of te investeren: ${currency(coverage.amount)}`
        : "Deze maand beter niet investeren of sparen";

  return (
    <div
      className={cn(
        "col-span-2 rounded-[12px] border bg-black/10 p-2.5",
        coverage.tone === "red" && "border-red-400/25 bg-[var(--negative-light)]",
        coverage.tone === "emerald" &&
          "border-emerald-400/20 bg-[var(--positive-light)]",
        coverage.tone === "zinc" && "border-[var(--border)] bg-[var(--bg-surface)]",
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-normal text-[var(--text-muted)]">
        Dekking
      </p>
      <p
        className={cn(
          "mt-1 text-sm font-semibold leading-5",
          coverage.tone === "red" && "text-[var(--negative)]",
          coverage.tone === "emerald" && "text-[var(--positive)]",
          coverage.tone === "zinc" && "text-[var(--text-secondary)]",
        )}
      >
        {coverage.text}
      </p>
      {showSavingsIndicator && (
        <p
          className={cn(
            "mt-2 rounded-[10px] border px-2.5 py-2 text-xs font-medium leading-4",
            savingsTone === "emerald" &&
              "border-emerald-400/20 bg-emerald-500/10 text-[var(--positive)]",
            savingsTone === "amber" &&
              "border-amber-400/20 bg-amber-500/10 text-amber-300",
            savingsTone === "zinc" &&
              "border-[var(--border)] bg-black/10 text-[var(--text-secondary)]",
          )}
        >
          {savingsText}
        </p>
      )}
      <p className="mt-1 text-[11px] leading-4 text-[var(--text-muted)]">
        Verwachte variabele uitgaven: {currency(coverage.expectedVariableTotal)}
      </p>
    </div>
  );
}

function ReceiptDraftValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[12px] border border-zinc-800/80 bg-zinc-950/45 p-2">
      <p className="text-[11px] font-medium uppercase tracking-normal text-zinc-500">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-zinc-50">{value}</p>
    </div>
  );
}

function QuickEntryCard({
  title,
  amount,
  account,
  date,
  note,
  category,
  paidById,
  variableCategories,
  accounts,
  householdMembers,
  categoryUsageCounts,
  customCategoryName,
  categoryMessage,
  isSavingCategory,
  categoryOperationId,
  onAmountChange,
  onAccountChange,
  onDateChange,
  onNoteChange,
  onCategoryChange,
  onPaidByChange,
  onCustomCategoryNameChange,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  isScanningReceipt,
  scanMessage,
  receiptDraft,
  onScanReceipt,
  onDismissReceiptDraft,
  onSubmit,
}: {
  title: string;
  amount: string;
  account: string;
  date: string;
  note: string;
  category: string;
  paidById: string;
  variableCategories: DashboardData["categories"];
  accounts: DashboardData["accounts"];
  householdMembers: DashboardData["householdMembers"];
  categoryUsageCounts: Map<string, number>;
  customCategoryName: string;
  categoryMessage: string;
  isSavingCategory: boolean;
  categoryOperationId: string | null;
  onAmountChange: (value: string) => void;
  onAccountChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onPaidByChange: (value: string) => void;
  onCustomCategoryNameChange: (value: string) => void;
  onAddCategory: () => void;
  onRenameCategory: (categoryId: string, name: string) => void;
  onDeleteCategory: (category: DashboardData["categories"][number]) => void;
  isScanningReceipt: boolean;
  scanMessage: string;
  receiptDraft: ReceiptDraft | null;
  onScanReceipt: (file: File) => void;
  onDismissReceiptDraft: () => void;
  onSubmit: () => void;
}) {
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [isCategoryPanelOpen, setIsCategoryPanelOpen] = useState(false);
  const customVariableCategories = variableCategories.filter(
    (item) => (item.sortOrder ?? 0) >= 200,
  );

  return (
    <Card className="finance-card max-w-full overflow-hidden lg:max-w-[480px]">
      <CardHeader className="space-y-3 pb-2 sm:pb-3">
        <div className="hidden sm:block">
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            Bedrag erin, categorie kiezen, klaar.
          </CardDescription>
        </div>
        <div className="grid gap-2 sm:hidden">
          <div className="min-w-0">
            <CardTitle className="text-lg">Uitgave invoeren</CardTitle>
            <CardDescription className="text-xs leading-4">
              Bedrag, categorie en klaar.
            </CardDescription>
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
            Rekening
          </p>
        </div>
        <div className="scrollbar-hidden flex h-9 max-w-full gap-1 overflow-x-auto overscroll-x-contain rounded-full bg-[#27272A] p-0.5 sm:hidden">
          {accounts.map((item) => {
            const isActive = account === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onAccountChange(item.id)}
                className={cn(
                  "h-8 min-h-0 min-w-fit flex-1 shrink-0 rounded-full px-3 text-xs font-medium text-[var(--text-secondary)]",
                  isActive &&
                    "bg-[#6366F1] text-white",
                )}
              >
                {item.name}
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5 pt-0 sm:space-y-3 sm:pt-0">
        {householdMembers.length > 0 && (
          <div className="grid gap-1.5 sm:hidden">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
              Betaald door
            </p>
            <div className="grid h-9 grid-cols-2 gap-1 rounded-full bg-[#27272A] p-0.5">
              {householdMembers.map((member) => {
                const isActive = paidById === member.userId;

                return (
                  <button
                    key={member.userId}
                    type="button"
                    onClick={() => onPaidByChange(member.userId)}
                    className={cn(
                      "h-8 min-h-0 rounded-full px-3 text-sm font-medium text-[var(--text-secondary)]",
                      isActive &&
                        "bg-[#6366F1] text-white",
                    )}
                  >
                    {member.displayName}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid gap-1.5 sm:hidden">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
            Categorie
          </p>
          <div className="scrollbar-hidden flex max-w-full gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5">
            {variableCategories.map((item) => (
              <button
                type="button"
                key={item.id}
                className={cn(
                  "shrink-0 rounded-[var(--radius-chip)] border-0 bg-[#27272A] px-2.5 py-1 text-[13px] font-medium text-[var(--text-secondary)] outline-none ring-0 transition focus-visible:outline-none focus-visible:ring-0",
                  category === item.id &&
                    "bg-[#6366F1] text-white",
                )}
                onClick={() => onCategoryChange(item.id)}
              >
                {item.name}
              </button>
            ))}
            <button
              type="button"
              className="shrink-0 rounded-[var(--radius-chip)] px-2.5 py-1 text-[13px] font-medium text-[var(--accent)]"
              onClick={() => setIsCategoryPanelOpen((open) => !open)}
            >
              Categorie toevoegen
            </button>
          </div>
        </div>

        {isCategoryPanelOpen && (
          <div className="grid gap-2 rounded-[14px] border border-[var(--border)] bg-black/10 p-3 sm:hidden">
            <Input
              placeholder="Bijv. Uit eten"
              value={customCategoryName}
              className="h-11"
              maxLength={40}
              onChange={(event) => onCustomCategoryNameChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onAddCategory();
                }
              }}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-[var(--text-muted)]">
                Nieuwe categorie verschijnt direct in de rij.
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="h-10"
                onClick={onAddCategory}
                disabled={isSavingCategory}
              >
                {isSavingCategory ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Opslaan
              </Button>
            </div>
            {categoryMessage && (
              <p className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-surface)] p-2 text-xs text-[var(--text-secondary)]">
                {categoryMessage}
              </p>
            )}
            {customVariableCategories.length > 0 && (
              <div className="grid gap-2 border-t border-[var(--border)] pt-2">
                {customVariableCategories.map((item) => {
                  const isEditing = editingCategoryId === item.id;
                  const isSavingThisCategory = categoryOperationId === item.id;

                  return (
                    <div
                      key={item.id}
                      className="grid gap-2 rounded-[12px] border border-[var(--border)] bg-[var(--bg-surface)] p-2"
                    >
                      {isEditing ? (
                        <Input
                          value={editingCategoryName}
                          className="h-10"
                          maxLength={40}
                          onChange={(event) =>
                            setEditingCategoryName(event.target.value)
                          }
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <p className="min-w-0 flex-1 text-sm font-medium text-[var(--text-primary)]">
                            {item.name}
                          </p>
                          <Badge className="border-[var(--border)] bg-black/10 text-[var(--text-muted)]">
                            {categoryUsageCounts.get(item.id) ?? 0}x
                          </Badge>
                        </div>
                      )}
                      <div className="flex justify-end gap-2">
                        {isEditing ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingCategoryId(null)}
                            >
                              Annuleer
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={isSavingThisCategory}
                              onClick={() => {
                                onRenameCategory(item.id, editingCategoryName);
                                setEditingCategoryId(null);
                              }}
                            >
                              {isSavingThisCategory ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                              Bewaar
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="icon"
                              variant="secondary"
                              title="Categorie hernoemen"
                              disabled={Boolean(categoryOperationId)}
                              onClick={() => {
                                setEditingCategoryId(item.id);
                                setEditingCategoryName(item.name);
                              }}
                              className="h-10 w-10"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Categorie verwijderen"
                              disabled={Boolean(categoryOperationId)}
                              onClick={() => onDeleteCategory(item)}
                              className="h-10 w-10 text-[var(--text-muted)] hover:text-[var(--negative)]"
                            >
                              {isSavingThisCategory ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-1">
          <FieldLabel label="Rekening">
            <Select
              value={account}
              className="h-10"
              onChange={(event) => onAccountChange(event.target.value)}
            >
              {accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </FieldLabel>

          {householdMembers.length > 0 && (
            <FieldLabel label="Betaald door">
              <Select
                value={paidById}
                className="h-10"
                onChange={(event) => onPaidByChange(event.target.value)}
              >
                {householdMembers.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.displayName}
                  </option>
                ))}
              </Select>
            </FieldLabel>
          )}

          <FieldLabel label="Categorie">
            <Select
              value={category}
              className="h-10"
              onChange={(event) => onCategoryChange(event.target.value)}
            >
              {variableCategories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </FieldLabel>
        </div>

        <details className="group hidden rounded-[14px] border border-[var(--border)] bg-black/10 sm:block">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium text-[var(--text-primary)]">
            Categorie toevoegen
            <Plus className="h-4 w-4 text-[var(--text-muted)] transition group-open:rotate-45" />
          </summary>
          <div className="grid gap-2 border-t border-[var(--border)] p-3">
            <Input
              placeholder="Bijv. Uit eten"
              value={customCategoryName}
              className="h-10"
              maxLength={40}
              onChange={(event) => onCustomCategoryNameChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onAddCategory();
                }
              }}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-[var(--text-muted)]">
                Komt direct bij je uitgaven te staan.
              </p>
              <Button
                size="sm"
                variant="secondary"
                onClick={onAddCategory}
                disabled={isSavingCategory}
              >
                {isSavingCategory ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Opslaan
              </Button>
            </div>
            {customVariableCategories.length > 0 && (
              <div className="grid gap-2 border-t border-[var(--border)] pt-3">
                <p className="text-xs font-medium uppercase tracking-normal text-[var(--text-muted)]">
                  Eigen categorieen
                </p>
                {customVariableCategories.map((item) => {
                  const isEditing = editingCategoryId === item.id;
                  const isSavingThisCategory = categoryOperationId === item.id;

                  return (
                    <div
                      key={item.id}
                      className="grid gap-2 rounded-[12px] border border-[var(--border)] bg-[var(--bg-surface)] p-2"
                    >
                      {isEditing ? (
                        <Input
                          value={editingCategoryName}
                          className="h-9"
                          maxLength={40}
                          onChange={(event) =>
                            setEditingCategoryName(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              onRenameCategory(item.id, editingCategoryName);
                              setEditingCategoryId(null);
                            }
                          }}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <p className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-primary)]">
                            {item.name}
                          </p>
                          <Badge className="border-[var(--border)] bg-black/10 text-[var(--text-muted)]">
                            {categoryUsageCounts.get(item.id) ?? 0}x
                          </Badge>
                        </div>
                      )}

                      <div className="flex justify-end gap-2">
                        {isEditing ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingCategoryId(null)}
                            >
                              Annuleer
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={isSavingThisCategory}
                              onClick={() => {
                                onRenameCategory(item.id, editingCategoryName);
                                setEditingCategoryId(null);
                              }}
                            >
                              {isSavingThisCategory ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                              Bewaar
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="icon"
                              variant="secondary"
                              title="Categorie hernoemen"
                              disabled={Boolean(categoryOperationId)}
                              onClick={() => {
                                setEditingCategoryId(item.id);
                                setEditingCategoryName(item.name);
                              }}
                              className="h-8 w-8"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Categorie verwijderen"
                              disabled={Boolean(categoryOperationId)}
                              onClick={() => onDeleteCategory(item)}
                              className="h-8 w-8 text-[var(--text-muted)] hover:text-[var(--negative)]"
                            >
                              {isSavingThisCategory ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {categoryMessage && (
              <p className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-surface)] p-2 text-xs text-[var(--text-secondary)]">
                {categoryMessage}
              </p>
            )}
          </div>
        </details>

        <div className="grid gap-1.5 sm:block">
          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)] sm:hidden">
            Bedrag
          </p>
          <Input
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            enterKeyHint="done"
            className="h-14 border-[#27272A] bg-black/10 text-center text-[38px] font-bold tracking-normal placeholder:text-zinc-700 sm:h-11 sm:rounded-[12px] sm:border-zinc-800 sm:bg-zinc-950/70 sm:text-left sm:text-base sm:font-semibold"
            onFocus={(event) =>
              event.currentTarget.scrollIntoView({
                block: "center",
                behavior: "smooth",
              })
            }
            onChange={(event) => onAmountChange(event.target.value)}
          />
        </div>

        <label className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-[var(--border)] bg-black/10 px-3 text-sm font-medium text-[var(--text-secondary)] transition active:scale-[0.99] sm:hidden">
          {isScanningReceipt ? (
            <LoaderCircle className="h-4 w-4 animate-spin text-[var(--accent)]" />
          ) : (
            <Camera className="h-4 w-4 text-[var(--accent)]" />
          )}
          {isScanningReceipt ? "Bon wordt gelezen" : "Scan bon"}
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            capture="environment"
            disabled={isScanningReceipt}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";

              if (file) {
                onScanReceipt(file);
              }
            }}
          />
        </label>

        {scanMessage && (
          <p
            className={cn(
              "rounded-[12px] border px-3 py-2 text-xs leading-4 sm:hidden",
              isScanningReceipt
                ? "border-indigo-400/20 bg-indigo-500/10 text-indigo-100"
                : "border-zinc-800 bg-zinc-950/70 text-zinc-300",
            )}
          >
            {scanMessage}
          </p>
        )}

        {receiptDraft && (
          <div className="grid gap-2 rounded-[14px] border border-indigo-400/25 bg-indigo-500/10 p-2.5 sm:hidden">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-50">
                  Bon overgenomen
                </p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Controleer, kies categorie en sla op.
                </p>
              </div>
              <Badge className="border-indigo-400/25 bg-indigo-500/15 text-indigo-100">
                scan
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <ReceiptDraftValue
                label="Bedrag"
                value={
                  typeof receiptDraft.amount === "number"
                    ? preciseCurrency(receiptDraft.amount)
                    : "onduidelijk"
                }
              />
              <ReceiptDraftValue
                label="Datum"
                value={receiptDraft.date ?? "onduidelijk"}
              />
              <ReceiptDraftValue
                label="Winkel"
                value={receiptDraft.merchant ?? "onduidelijk"}
              />
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={onDismissReceiptDraft}
                className="h-9"
              >
                <X className="h-4 w-4" />
                Verberg
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-[0.95fr_1.05fr] gap-2 sm:hidden">
          <label className="grid gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
              Datum
            </span>
            <Input
              type="date"
              value={date}
              className="finance-mobile-date-anchor h-11 border-transparent bg-black/10 text-xs"
              onChange={(event) => onDateChange(event.target.value)}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
              Notitie
            </span>
            <Input
              placeholder="Optioneel"
              value={note}
              className="h-11 border-transparent bg-black/10"
              onChange={(event) => onNoteChange(event.target.value)}
            />
          </label>
        </div>

        <div className="hidden gap-3 sm:grid">
          <Input
            type="date"
            value={date}
            className="h-10"
            onChange={(event) => onDateChange(event.target.value)}
          />
          <Textarea
            placeholder="Notitie optioneel"
            value={note}
            className="min-h-16"
            onChange={(event) => onNoteChange(event.target.value)}
          />
        </div>

        <div className="sticky bottom-3 z-10 flex justify-end pt-1.5 sm:static sm:pt-2">
          <Button className="accent-glow-hover h-12 w-full text-sm font-semibold sm:h-11 sm:w-auto sm:text-sm" onClick={onSubmit}>
            <Plus className="h-5 w-5" />
            Uitgave toevoegen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const tooltipStyle = {
  background: "#1E1E28",
  border: "1px solid rgba(255,255,255,0.13)",
  borderRadius: 10,
  color: "#F4F4F6",
  padding: "10px 14px",
};

function parseCurrencyInput(value: string) {
  return Number(value.trim().replace(/\s/g, "").replace(",", "."));
}

function formatCryptoAmount(value: number) {
  return new Intl.NumberFormat("nl-NL", {
    maximumFractionDigits: 10,
  }).format(value);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function fileNamePart(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "onbekend"
  );
}

function fileAmountPart(value: number) {
  return value.toFixed(2).replace(".", "-");
}

function uniqueZipFileName(filename: string, usedNames: Map<string, number>) {
  const count = usedNames.get(filename) ?? 0;
  usedNames.set(filename, count + 1);

  if (count === 0) {
    return filename;
  }

  return filename.replace(/\.jpg$/, `-${count + 1}.jpg`);
}

async function loadReceiptImagesForPdf(transactions: Transaction[]) {
  const receiptTransactions = transactions.filter(
    (transaction): transaction is Transaction & { receiptUrl: string } =>
      Boolean(transaction.receiptUrl),
  );
  const supabase = getSupabaseBrowserClient();
  const images: Record<string, string> = {};

  for (const transaction of receiptTransactions) {
    const { data, error } = await supabase.storage
      .from("receipts")
      .download(transaction.receiptUrl);

    if (error || !data) {
      continue;
    }

    try {
      images[transaction.id] = await blobToDataUrl(data);
    } catch {
      // Keep the PDF usable even when one receipt image cannot be embedded.
    }
  }

  return images;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Bon kon niet aan PDF worden toegevoegd."));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function saveReceiptForTransaction({
  file,
  accountId,
  transactionId,
}: {
  file: File;
  accountId: string;
  transactionId: string;
}) {
  const receiptBlob = await compressReceiptImage(file);
  const formData = new FormData();

  console.log("[finance:receipt-upload-client]", {
    endpoint: "/api/receipts",
    transactionId,
    accountId,
    originalFile: {
      name: file.name,
      type: file.type,
      size: file.size,
    },
    compressedFile: {
      type: receiptBlob.type,
      size: receiptBlob.size,
    },
  });

  formData.append("transactionId", transactionId);
  formData.append("accountId", accountId);
  formData.append("image", receiptBlob, "receipt.jpg");

  const response = await fetch("/api/receipts", {
    method: "POST",
    body: formData,
  });
  const result = await response.json();

  if (!response.ok || typeof result.receiptUrl !== "string") {
    console.error("[finance:receipt-upload-client:error]", {
      status: response.status,
      statusText: response.statusText,
      result,
    });

    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Bon opslaan lukte niet.",
    );
  }

  return result.receiptUrl;
}

async function compressReceiptImage(file: File) {
  const image = await loadImage(file);
  const maxWidth = 800;
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Bon kon niet worden gecomprimeerd.");
  }

  context.drawImage(image, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("Bon kon niet worden gecomprimeerd."));
      },
      "image/jpeg",
      0.6,
    );
  });
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Bon kon niet worden geopend."));
    };
    image.src = url;
  });
}

function signedTransactionAmount(transaction: Transaction) {
  const amount = Math.abs(transaction.amount);

  switch (transaction.type) {
    case "income":
    case "contribution":
      return amount;
    case "sparen":
    case "fixed":
    case "variable":
      return -amount;
    default:
      return 0;
  }
}

function buildHeroBudgetSnapshot({
  incomingTotal,
  postedIncomingTotal,
  plannedIncomingTotal,
  expectedFixedTotal,
  variableExpenseTotal,
}: {
  incomingTotal: number;
  postedIncomingTotal: number;
  plannedIncomingTotal: number;
  expectedFixedTotal: number;
  variableExpenseTotal: number;
}) {
  const freeBudget = incomingTotal - expectedFixedTotal;
  const remainingFreeBudget = freeBudget - variableExpenseTotal;
  const expenseProgress =
    freeBudget > 0
      ? clampPercentage((variableExpenseTotal / freeBudget) * 100)
      : variableExpenseTotal > 0
        ? 100
        : 0;
  const depositProgress =
    plannedIncomingTotal > 0
      ? clampPercentage((postedIncomingTotal / plannedIncomingTotal) * 100)
      : undefined;

  return {
    incomingTotal,
    postedIncomingTotal,
    plannedIncomingTotal,
    expectedFixedTotal,
    variableExpenseTotal,
    freeBudget,
    remainingFreeBudget,
    expenseProgress,
    expenseProgressTone: expenseProgressTone(expenseProgress),
    depositProgress,
    depositProgressTone:
      typeof depositProgress === "number"
        ? depositProgressTone(depositProgress)
        : undefined,
  };
}

function clampPercentage(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(value, 0), 100);
}

function expenseProgressTone(progress: number): "emerald" | "orange" | "red" {
  if (progress < 60) return "emerald";
  if (progress <= 90) return "orange";
  return "red";
}

function depositProgressTone(progress: number): "emerald" | "orange" | "red" {
  if (progress >= 90) return "emerald";
  if (progress >= 60) return "orange";
  return "red";
}

function buildVariableSpendPacing({
  transactions,
  month,
  today,
}: {
  transactions: Transaction[];
  month: string;
  today: string;
}): VariableSpendPacingResult {
  const daysInMonth = daysInIsoMonth(month);
  const dataDays = dataDaysForMonth(month, today);
  const remainingDays = Math.max(daysInMonth - dataDays, 0);
  const currentVariableTotal = variableTotalForMonth(
    transactions,
    month,
    dataDays,
  );
  const historicalMonths = [1, 2, 3].map((offset) => addIsoMonths(month, -offset));
  const historicalRows = historicalMonths
    .map((historicalMonth) => ({
      month: historicalMonth,
      total: variableTotalForMonth(transactions, historicalMonth),
      days: daysInIsoMonth(historicalMonth),
    }))
    .filter((row) => row.total > 0);
  const historyMonths = historicalRows.length;
  const historicalDays = historicalRows.reduce((total, row) => total + row.days, 0);
  const historicalDailyAverage =
    historicalRows.reduce((total, row) => total + row.total, 0) /
    Math.max(historicalDays, 1);
  const estimatedVariableTotal =
    historyMonths > 0 ? historicalDailyAverage * daysInMonth : currentVariableTotal;
  const expectedToDate =
    historyMonths > 0 ? historicalDailyAverage * dataDays : currentVariableTotal;
  const previousMonth = addIsoMonths(month, -1);
  const previousMonthDay = Math.min(dataDays, daysInIsoMonth(previousMonth));
  const previousMonthTotalToDate =
    previousMonthDay > 0
      ? variableTotalForMonth(transactions, previousMonth, previousMonthDay)
      : 0;
  const paceRatio =
    expectedToDate > 0
      ? currentVariableTotal / expectedToDate
      : currentVariableTotal > 0
        ? Number.POSITIVE_INFINITY
        : 0;
  const tone =
    historyMonths === 0
      ? "zinc"
      : paceRatio <= 0.85
        ? "emerald"
        : paceRatio <= 1.05
          ? "orange"
          : "red";

  return {
    estimatedVariableTotal,
    forecastVariableTotal:
      historyMonths > 0
        ? currentVariableTotal + historicalDailyAverage * remainingDays
        : currentVariableTotal,
    currentVariableTotal,
    previousMonthTotalToDate,
    expectedToDate,
    historicalDailyAverage,
    remainingDays,
    historyMonths,
    dataDays,
    progress:
      estimatedVariableTotal > 0
        ? clampPercentage((currentVariableTotal / estimatedVariableTotal) * 100)
        : currentVariableTotal > 0
          ? 100
          : 0,
    previousProgress:
      estimatedVariableTotal > 0
        ? clampPercentage((previousMonthTotalToDate / estimatedVariableTotal) * 100)
        : previousMonthTotalToDate > 0
          ? 100
          : 0,
    tone,
  };
}

function buildContributionCoverage({
  transactions,
  month,
  plannedContributionTotal,
  fixedTotal,
  buffer,
}: {
  transactions: Transaction[];
  month: string;
  plannedContributionTotal: number;
  fixedTotal: number;
  buffer: number;
}): ContributionCoverageResult {
  const pacing = buildVariableSpendPacing({
    transactions,
    month,
    today: new Date().toISOString().slice(0, 10),
  });
  const { currentVariableTotal, dataDays, historyMonths } = pacing;
  const hasForecast = dataDays >= 10 && historyMonths >= 3;
  const expectedVariableTotal = hasForecast
    ? pacing.forecastVariableTotal
    : currentVariableTotal;
  const amount =
    plannedContributionTotal - fixedTotal - expectedVariableTotal - buffer;

  if (!hasForecast) {
    return {
      amount,
      expectedVariableTotal,
      currentVariableTotal,
      historyMonths,
      dataDays,
      tone: "zinc",
      text: `Nog te vroeg om te voorspellen — ${dataDays} dagen data deze maand`,
    };
  }

  if (amount >= 0) {
    return {
      amount,
      expectedVariableTotal,
      currentVariableTotal,
      historyMonths,
      dataDays,
      tone: "emerald",
      text: `Jullie komen uit — verwacht ${currency(amount)} over boven de buffer`,
    };
  }

  return {
    amount,
    expectedVariableTotal,
    currentVariableTotal,
    historyMonths,
    dataDays,
    tone: "red",
    text: `Let op: op basis van jullie gemiddelde komen jullie ${currency(Math.abs(amount))} tekort`,
  };
}

function buildPersonalContributionCoverage({
  transactions,
  month,
  incomeTotal,
  ownMonthlyContributionTotal,
  buffer,
}: {
  transactions: Transaction[];
  month: string;
  incomeTotal: number;
  ownMonthlyContributionTotal: number;
  buffer: number;
}): ContributionCoverageResult {
  const pacing = buildVariableSpendPacing({
    transactions,
    month,
    today: new Date().toISOString().slice(0, 10),
  });
  const { currentVariableTotal, dataDays, historyMonths } = pacing;
  const hasForecast = dataDays >= 10 && historyMonths >= 2;
  const expectedVariableTotal = hasForecast
    ? pacing.forecastVariableTotal
    : currentVariableTotal;
  const amount =
    incomeTotal - ownMonthlyContributionTotal - expectedVariableTotal - buffer;

  if (!hasForecast) {
    return {
      amount,
      expectedVariableTotal,
      currentVariableTotal,
      historyMonths,
      dataDays,
      tone: "zinc",
      text: `Nog te vroeg om te voorspellen — ${dataDays} dagen data deze maand`,
    };
  }

  if (amount >= 0) {
    return {
      amount,
      expectedVariableTotal,
      currentVariableTotal,
      historyMonths,
      dataDays,
      tone: "emerald",
      text: `Je houdt ${currency(amount)} over boven je buffer na storting en eigen kosten`,
    };
  }

  return {
    amount,
    expectedVariableTotal,
    currentVariableTotal,
    historyMonths,
    dataDays,
    tone: "red",
    text: `Let op: je komt naar verwachting ${currency(Math.abs(amount))} tekort deze maand`,
  };
}

function buildOutgoingTransactionRows(
  monthTransactions: Transaction[],
  fixedItems: FixedAgendaItem[],
  labels: Map<string, DashboardData["categories"][number]>,
  today: string,
) {
  const fixedRows: OutgoingTransactionRow[] = fixedItems
    .filter((item) => item.state !== "skipped" && item.date <= today)
    .map((item) => ({
      id: `fixed-${item.recurringExpenseId}-${item.date}`,
      date: item.date,
      title: item.name,
      subtitle: `${item.categoryName} · ${agendaStateLabel(item.state)}`,
      amount: item.amount,
      signedAmount: -item.amount,
      kind: "fixed",
      color: item.categoryColor,
      state: item.state,
    }));
  const variableRows: OutgoingTransactionRow[] = monthTransactions
    .filter((transaction) => transaction.type === "variable")
    .map((transaction) => {
      const category = labels.get(transaction.categoryId);

      return {
        id: `variable-${transaction.id}`,
        date: transaction.date,
        title: category?.name ?? "Uitgave",
        subtitle: [transaction.note, transaction.paidBy ?? transaction.enteredBy]
          .filter(Boolean)
          .join(" · "),
        amount: transaction.amount,
        signedAmount: -transaction.amount,
        kind: "variable",
        color: category?.color ?? "#6366F1",
        receiptUrl: transaction.receiptUrl,
        transaction,
      };
    });
  const savingsRows: OutgoingTransactionRow[] = monthTransactions
    .filter((transaction) => transaction.type === "sparen")
    .filter((transaction) => transaction.date <= today)
    .map((transaction) => ({
      id: `sparen-${transaction.id}`,
      date: transaction.date,
      title: SAVINGS_CATEGORY_NAME,
      subtitle: [transaction.note, transaction.paidBy ?? transaction.enteredBy]
        .filter(Boolean)
        .join(" · "),
      amount: transaction.amount,
      signedAmount: -transaction.amount,
      kind: "sparen",
      color: SAVINGS_COLOR,
      transaction,
    }));
  const positiveRows: OutgoingTransactionRow[] = monthTransactions
    .filter(
      (transaction) =>
        transaction.type === "contribution" || transaction.type === "income",
    )
    .filter((transaction) => transaction.date <= today)
    .map((transaction) => {
      const category = labels.get(transaction.categoryId);
      const title =
        transaction.type === "contribution"
          ? [
              transaction.note?.trim() || contributionDisplayName(transaction),
              transaction.paidBy ?? transaction.enteredBy,
            ]
              .filter(Boolean)
              .join(" — ")
          : category?.name ?? "Inkomen";
      const subtitle =
        transaction.type === "contribution"
          ? transaction.date
          : [transaction.date, transaction.note].filter(Boolean).join(" · ");

      return {
        id: `${transaction.type}-${transaction.id}`,
        date: transaction.date,
        title,
        subtitle,
        amount: transaction.amount,
        signedAmount: transaction.amount,
        kind: transaction.type,
        color: transaction.type === "contribution" ? "#10B981" : "#22C55E",
        receiptUrl: transaction.receiptUrl,
        transaction,
      };
    });
  return [...fixedRows, ...variableRows, ...savingsRows, ...positiveRows].sort(
    (first, second) =>
      second.date.localeCompare(first.date) ||
      first.title.localeCompare(second.title, "nl"),
    );
}

function expectedFixedTotalForMonth(
  recurringExpenses: RecurringExpense[],
  fixedInstances: FixedExpenseInstance[],
  currentMonth: string,
) {
  const currentMonthInstances = new Map(
    fixedInstances
      .filter((instance) => instance.month === currentMonth)
      .map((instance) => [instance.recurringExpenseId, instance]),
  );

  return recurringExpenses
    .filter((expense) => expense.isActive)
    .reduce((total, expense) => {
      const instance = currentMonthInstances.get(expense.id);

      if (instance?.status === "skipped") {
        return total;
      }

      return total + (instance?.amount ?? expense.currentAmount);
    }, 0);
}

function contributionKindLabel(kind: ContributionKind) {
  if (kind === "planned") return "Geplande storting";
  if (kind === "belastingteruggave") return "Belastingteruggave";
  return "Extra storting";
}

function defaultContributionNote(kind: ContributionKind) {
  if (kind === "planned") return "Geplande storting";
  if (kind === "belastingteruggave") return "Belastingteruggave";
  return "Extra storting";
}

function contributionDisplayName(
  transaction: Pick<Transaction, "contributionKind" | "enteredBy" | "paidBy">,
  includePerson = false,
) {
  const label =
    transaction.contributionKind === "planned"
      ? "Reguliere storting"
      : transaction.contributionKind === "extra"
        ? "Extra storting"
        : transaction.contributionKind === "belastingteruggave"
          ? "Belastingteruggave"
          : "Storting";

  if (!includePerson) {
    return label;
  }

  return `${label} — ${transaction.paidBy ?? transaction.enteredBy}`;
}

function transactionSortLabel(
  transaction: Transaction,
  labels: Map<string, DashboardData["categories"][number]>,
) {
  if (transaction.type === "contribution") {
    return contributionDisplayName(transaction, true);
  }

  if (transaction.type === "sparen") {
    return SAVINGS_CATEGORY_NAME;
  }

  return labels.get(transaction.categoryId)?.name ?? transaction.type;
}

function transactionRowMetaLabel(
  row: OutgoingTransactionRow,
  selectedAccountId: string,
) {
  if (selectedAccountId === "all") {
    return row.transaction?.accountName ?? "";
  }

  if (row.transaction?.paidBy || row.transaction?.enteredBy) {
    return row.transaction.paidBy ?? row.transaction.enteredBy;
  }

  if (row.kind === "fixed") return "Vaste last";
  if (row.kind === "contribution") return "Storting";
  if (row.kind === "income") return "Inkomen";
  if (row.kind === "sparen") return "Sparen";
  return "Uitgave";
}

function buildContributionPlanRows(
  plans: ContributionPlan[],
  receivedByUser: Map<string, number>,
) {
  const remainingReceivedByUser = new Map(receivedByUser);

  return sortContributionPlans(plans).map((plan) => {
    const receivedKey = receivedByUser.has(plan.userId) ? plan.userId : plan.person;
    const availableReceived = remainingReceivedByUser.get(receivedKey) ?? 0;
    const received = Math.min(plan.monthlyAmount, availableReceived);

    remainingReceivedByUser.set(
      receivedKey,
      Math.max(availableReceived - received, 0),
    );

    return {
      ...plan,
      received,
      remaining: Math.max(plan.monthlyAmount - received, 0),
    };
  });
}

function buildContributionBreakdown({
  transactions,
  plans,
  householdMembers,
  currentMonth,
  sharedAccountId,
}: {
  transactions: Transaction[];
  plans: ContributionPlan[];
  householdMembers: DashboardData["householdMembers"];
  currentMonth: string;
  sharedAccountId?: string;
}): ContributionPersonBreakdown[] {
  const rowsByPerson = new Map<string, ContributionPersonBreakdown>();
  const memberNames = new Map(
    householdMembers.map((member) => [member.userId, member.displayName]),
  );
  const canonicalPersonNames = new Map(
    householdMembers.map((member) => [
      normalizePersonName(member.displayName),
      member.displayName,
    ]),
  );
  const personOrder = new Map<string, number>();

  householdMembers.forEach((member, index) => {
    personOrder.set(member.displayName, index);
  });
  plans.forEach((plan, index) => {
    if (!personOrder.has(plan.person)) {
      personOrder.set(plan.person, householdMembers.length + index);
    }
  });
  const ensurePerson = (person: string) => {
    const canonicalPerson =
      canonicalPersonNames.get(normalizePersonName(person)) ?? person;
    const current = rowsByPerson.get(canonicalPerson);

    if (current) {
      return current;
    }

    const row = {
      person: canonicalPerson,
      planned: [],
      extra: [],
      taxReturn: [],
      unknown: [],
    } satisfies ContributionPersonBreakdown;

    rowsByPerson.set(canonicalPerson, row);
    return row;
  };
  const resolveContributionPerson = (transaction: Transaction) => {
    const candidates = [
      transaction.paidById ? memberNames.get(transaction.paidById) : undefined,
      transaction.paidBy,
      transaction.enteredById
        ? memberNames.get(transaction.enteredById)
        : undefined,
      transaction.enteredBy,
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;

      const canonicalPerson = canonicalPersonNames.get(
        normalizePersonName(candidate),
      );

      if (canonicalPerson) {
        return canonicalPerson;
      }
    }

    return candidates.find(Boolean) ?? "Onbekend";
  };

  householdMembers.forEach((member) => ensurePerson(member.displayName));
  plans.forEach((plan) => ensurePerson(plan.person));

  transactions
    .filter((transaction) => transaction.type === "contribution")
    .filter((transaction) => transaction.date.startsWith(currentMonth))
    .filter(
      (transaction) =>
        !sharedAccountId ||
        (transaction.accountId ?? sharedAccountId) === sharedAccountId,
    )
    .forEach((transaction) => {
      const person = resolveContributionPerson(transaction);
      const row = ensurePerson(person);
      const target =
        transaction.contributionKind === "planned"
          ? row.planned
          : transaction.contributionKind === "extra"
            ? row.extra
            : transaction.contributionKind === "belastingteruggave"
              ? row.taxReturn
              : row.unknown;

      target.push({
        id: transaction.id,
        date: transaction.date,
        amount: transaction.amount,
      });
    });

  return Array.from(rowsByPerson.values())
    .map((row) => ({
      ...row,
      planned: row.planned.sort((first, second) =>
        first.date.localeCompare(second.date),
      ),
      extra: row.extra.sort((first, second) =>
        first.date.localeCompare(second.date),
      ),
      taxReturn: row.taxReturn.sort((first, second) =>
        first.date.localeCompare(second.date),
      ),
      unknown: row.unknown.sort((first, second) =>
        first.date.localeCompare(second.date),
      ),
    }))
    .sort(
      (first, second) =>
        (personOrder.get(first.person) ?? Number.MAX_SAFE_INTEGER) -
          (personOrder.get(second.person) ?? Number.MAX_SAFE_INTEGER) ||
        first.person.localeCompare(second.person, "nl"),
	    );
}

function normalizePersonName(value: string) {
  return value.trim().toLocaleLowerCase("nl-NL");
}

function variableTotalForMonth(
  transactions: Transaction[],
  month: string,
  throughDay?: number,
) {
  const throughDate =
    typeof throughDay === "number" && throughDay > 0
      ? dateForBillingDay(month, throughDay)
      : null;

  return transactions
    .filter((transaction) => transaction.type === "variable")
    .filter((transaction) => transaction.date.startsWith(month))
    .filter((transaction) => !throughDate || transaction.date <= throughDate)
    .reduce((total, transaction) => total + transaction.amount, 0);
}

function dataDaysForMonth(
  month: string,
  today = new Date().toISOString().slice(0, 10),
) {
  const currentMonth = today.slice(0, 7);

  if (month === currentMonth) {
    return Number(today.slice(8, 10));
  }

  if (month < currentMonth) {
    return daysInIsoMonth(month);
  }

  return 0;
}

function daysInIsoMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

function cashflowBufferStorageKey(accountId: string) {
  return `${cashflowBufferStorageKeyPrefix}:${accountId || "default"}`;
}

function readCashflowBuffer(accountId: string, allowLegacyFallback = false) {
  if (typeof window === "undefined") return 500;

  const savedValue =
    window.localStorage.getItem(cashflowBufferStorageKey(accountId)) ??
    (allowLegacyFallback
      ? window.localStorage.getItem(cashflowBufferStorageKeyPrefix)
      : null);
  const parsedValue = savedValue ? Number(savedValue) : 500;

  return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : 500;
}

function buildCashflowTimeline({
  startSnapshot,
  currentBalance,
  month,
  transactions,
  events,
}: {
  startSnapshot?: CashflowStartSnapshot;
  currentBalance: number | null;
  month: string;
  transactions: Transaction[];
  events: CashflowEvent[];
}) {
  if (!startSnapshot) {
    return [];
  }

  const [, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Number(month.slice(0, 4)), monthNumber, 0).getDate();
  const actualDailyChanges = Array.from({ length: daysInMonth }, () => 0);
  const projectedDailyChanges = Array.from({ length: daysInMonth }, () => 0);
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const isCurrentMonth = today.startsWith(month);
  const monthStartDate = `${month}-01`;
  const nextMonthStart = monthStart(addIsoMonths(month, 1));
  const dayIndex = (day: number) => {
    const safeDay = Math.min(Math.max(day, 1), daysInMonth);
    return safeDay - 1;
  };

  transactions
    .filter((transaction) => transaction.date.startsWith(month))
    .forEach((transaction) => {
      actualDailyChanges[
        dayIndex(Number(transaction.date.slice(8, 10)))
      ] += signedTransactionAmount(transaction);
    });

  events
    .filter((event) => event.date.startsWith(month))
    .forEach((event) => {
      projectedDailyChanges[dayIndex(event.day)] += event.amount;
    });

  const transactionsBetweenSnapshotAndMonthStart = transactions
    .filter((transaction) => transaction.date >= startSnapshot.snapshotDate)
    .filter((transaction) => transaction.date < monthStartDate)
    .filter((transaction) => transaction.date < nextMonthStart)
    .reduce((total, transaction) => total + signedTransactionAmount(transaction), 0);
  const transactionsBetweenMonthStartAndSnapshot = transactions
    .filter((transaction) => transaction.date >= monthStartDate)
    .filter((transaction) => transaction.date < startSnapshot.snapshotDate)
    .filter((transaction) => transaction.date < nextMonthStart)
    .reduce((total, transaction) => total + signedTransactionAmount(transaction), 0);
  const openingBalance =
    startSnapshot.snapshotDate <= monthStartDate
      ? startSnapshot.balance + transactionsBetweenSnapshotAndMonthStart
      : startSnapshot.balance - transactionsBetweenMonthStartAndSnapshot;

  let runningBalance = openingBalance;

  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = dateForBillingDay(month, day);

    if (isCurrentMonth && date === today && currentBalance !== null) {
      runningBalance = currentBalance;
    } else if (
      date > startSnapshot.snapshotDate &&
      (isCurrentMonth ? date < today : month < currentMonth)
    ) {
      runningBalance += actualDailyChanges[index];
    } else {
      runningBalance += projectedDailyChanges[index];
    }

    return {
      day,
      balance: runningBalance,
    } satisfies CashflowPoint;
  });
}

function cashflowLineColor(balance: number, buffer: number) {
  if (balance < 0) return "#EF4444";
  if (balance < buffer) return "#F59E0B";
  return "#10B981";
}

function buildCashflowChartModel(
  points: CashflowPoint[],
  buffer: number,
  month: string,
) {
  const [, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(
    Number(month.slice(0, 4)),
    monthNumber,
    0,
  ).getDate();
  const today = new Date().toISOString().slice(0, 10);
  const todayLineDay = today.startsWith(month)
    ? Number(today.slice(8, 10))
    : undefined;
  const balances = points.map((point) => point.balance);
  const yScale = cashflowAxisScale(
    Math.min(...balances, buffer, 0),
    Math.max(...balances, buffer, 0),
  );
  const orangeZone = [
    Math.max(0, yScale.domain[0]),
    Math.min(buffer, yScale.domain[1]),
  ] as const;
  const redZone = [yScale.domain[0], Math.min(0, yScale.domain[1])] as const;

  return {
    data: points,
    xDomain: [1, daysInMonth] as [number, number],
    xTicks: cashflowDateTicks(1, daysInMonth),
    yDomain: yScale.domain,
    yTicks: yScale.ticks,
    todayLineDay,
    orangeZone,
    redZone,
    showOrangeZone:
      orangeZone[1] > orangeZone[0] &&
      points.some((point) => point.balance < buffer && point.balance >= 0),
    showRedZone:
      redZone[1] > redZone[0] &&
      points.some((point) => point.balance < 0),
    segments: points.slice(1).map((point, index) => {
      const previousPoint = points[index];

      return {
        id: `${previousPoint.day}-${point.day}`,
        data: [previousPoint, point],
        color: cashflowLineColor(point.balance, buffer),
      };
    }),
  };
}

function cashflowAxisScale(minValue: number, maxValue: number) {
  const rawRange = Math.max(maxValue - minValue, 1);
  const step = niceCashflowStep(rawRange / 4);
  const min = Math.floor(minValue / step) * step;
  const max = Math.ceil(maxValue / step) * step;
  const ticks: number[] = [];

  for (let tick = min; tick <= max + step * 0.5; tick += step) {
    ticks.push(Math.round(tick));
  }

  return {
    domain: [min, max] as [number, number],
    ticks: ticks.length >= 2 ? ticks : [min, max],
  };
}

function niceCashflowStep(value: number) {
  const exponent = Math.floor(Math.log10(Math.max(value, 1)));
  const base = 10 ** exponent;
  const fraction = value / base;

  if (fraction <= 1) return base;
  if (fraction <= 2) return base * 2;
  if (fraction <= 5) return base * 5;
  return base * 10;
}

function cashflowDateTicks(minDay: number, maxDay: number) {
  if (minDay === maxDay) {
    return [minDay];
  }

  const middleDay = Math.round((minDay + maxDay) / 2);

  return Array.from(new Set([minDay, middleDay, maxDay]));
}

function formatCashflowDateTick(month: string, day: number) {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "short",
  }).format(new Date(`${dateForBillingDay(month, day)}T00:00:00`));
}

function formatCashflowStartDate(date: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T00:00:00`));
}

function formatCashflowAxisValue(value: number) {
  const absoluteValue = Math.abs(value);
  const prefix = value < 0 ? "-€" : "€";

  if (absoluteValue >= 1000) {
    const roundedValue = absoluteValue / 1000;
    const decimals = absoluteValue >= 10000 ? 0 : 1;

    return `${prefix}${roundedValue
      .toFixed(decimals)
      .replace(".", ",")}k`;
  }

  return `${prefix}${Math.round(absoluteValue).toLocaleString("nl-NL")}`;
}

function cashflowInsight(points: CashflowPoint[], buffer: number) {
  if (!points.length) {
    return {
      status: "healthy" as const,
      text: "Geen stress deze maand. Geen toekomstige cashflowpunten.",
    };
  }

  const lowestPoint = points.reduce(
    (lowest, point) => (point.balance < lowest.balance ? point : lowest),
    points[0],
  );
  const firstNegative = points.find((point) => point.balance < 0);

  if (firstNegative) {
    return {
      status: "negative" as const,
      text: `Opgelet: saldo wordt negatief rond dag ${firstNegative.day}. Laagste punt: ${currency(lowestPoint.balance)}.`,
    };
  }

  const belowBufferPoints = points.filter((point) => point.balance < buffer);

  if (!belowBufferPoints.length) {
    return {
      status: "healthy" as const,
      text: `Geen stress deze maand. Laagste punt: ${currency(lowestPoint.balance)} op dag ${lowestPoint.day}.`,
    };
  }

  const firstBelowIndex = points.findIndex((point) => point.balance < buffer);
  const recoveryPoint = points
    .slice(Math.max(firstBelowIndex + 1, 0))
    .find((point) => point.balance >= buffer);

  return {
    status: "below-buffer" as const,
    text: recoveryPoint
      ? `Jullie komen ${belowBufferPoints.length} dagen onder de buffer — trekt bij rond dag ${recoveryPoint.day}.`
      : `Jullie komen ${belowBufferPoints.length} dagen onder de buffer en herstellen niet voor einde maand.`,
  };
}

function buildFixedAgendaItems(
  recurringExpenses: RecurringExpense[],
  fixedInstances: FixedExpenseInstance[],
  currentMonth: string,
  labels: Map<string, DashboardData["categories"][number]>,
) {
  const currentMonthInstances = new Map(
    fixedInstances
      .filter((instance) => instance.month === currentMonth)
      .map((instance) => [instance.recurringExpenseId, instance]),
  );
  const today = new Date().toISOString().slice(0, 10);

  return recurringExpenses
    .filter((expense) => expense.isActive)
    .map((expense) => {
      const instance = currentMonthInstances.get(expense.id);
      const date = dateForBillingDay(currentMonth, expense.billingDay);
      const category = labels.get(expense.categoryId);
      const state = agendaState(instance?.status, date, today);

      return {
        id: instance?.id ?? expense.id,
        recurringExpenseId: expense.id,
        name: instance?.name ?? expense.name,
        categoryName: category?.name ?? "Onbekend",
        categoryColor: category?.color ?? "#6366F1",
        amount: instance?.amount ?? expense.currentAmount,
        date,
        day: Number(date.slice(8, 10)),
        state,
        canSkip: instance?.status === "pending",
        note: instance?.note,
      } satisfies FixedAgendaItem;
    })
    .sort(
      (first, second) =>
        first.date.localeCompare(second.date) ||
        first.name.localeCompare(second.name, "nl"),
    );
}

function agendaState(
  status: FixedExpenseInstance["status"] | undefined,
  date: string,
  today: string,
): FixedAgendaState {
  if (status === "confirmed") return "processed";
  if (status === "adjusted") return "changed";
  if (status === "skipped") return "skipped";
  if (date < today) return "autoProcessed";
  if (date === today) return "today";
  return "upcoming";
}

function agendaStateLabel(state: FixedAgendaState) {
  const labels: Record<FixedAgendaState, string> = {
        processed: "afgelopen",
        autoProcessed: "afgeschreven",
        changed: "aangepast",
        skipped: "overgeslagen",
        overdue: "had al moeten komen",
        today: "vandaag",
        upcoming: "komt eraan",
  };

  return labels[state];
}

function isProcessedAgendaState(state: FixedAgendaState) {
  return state === "processed" || state === "autoProcessed" || state === "changed";
}

function dateForBillingDay(month: string, billingDay: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const safeDay = Math.min(Math.max(billingDay, 1), daysInMonth);

  return `${month}-${String(safeDay).padStart(2, "0")}`;
}

function buildMonthOptions(
  transactions: Transaction[],
  fixedInstances: FixedExpenseInstance[],
  balanceSnapshots: AccountBalanceSnapshot[],
  currentMonth: string,
) {
  const observedMonths = new Set<string>();
  const earliestDefaultMonth = addIsoMonths(currentMonth, -23);

  transactions.forEach((transaction) =>
    observedMonths.add(transaction.date.slice(0, 7)),
  );
  fixedInstances.forEach((instance) => observedMonths.add(instance.month));
  balanceSnapshots.forEach((snapshot) =>
    observedMonths.add(snapshot.snapshotDate.slice(0, 7)),
  );

  const earliestObservedMonth =
    Array.from(observedMonths)
      .filter((month) => month <= currentMonth)
      .sort((first, second) => first.localeCompare(second))[0] ??
    earliestDefaultMonth;
  const earliestMonth =
    earliestObservedMonth < earliestDefaultMonth
      ? earliestObservedMonth
      : earliestDefaultMonth;
  const sortedMonths: string[] = [];
  let cursor = currentMonth;

  while (cursor >= earliestMonth) {
    sortedMonths.push(cursor);
    cursor = addIsoMonths(cursor, -1);
  }

  return sortedMonths.map((month) => ({
    value: month,
    label: monthLabel(month),
  })) satisfies MonthOption[];
}

function groupMonthOptionsByYear(monthOptions: MonthOption[]) {
  const groups = new Map<string, MonthOption[]>();

  monthOptions.forEach((month) => {
    const year = month.value.slice(0, 4);
    groups.set(year, [...(groups.get(year) ?? []), month]);
  });

  return Array.from(groups.entries()).map(([year, months]) => ({
    year,
    months,
  }));
}

function addIsoMonths(month: string, delta: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + delta, 1);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeMonthRange(fromMonth: string, toMonth: string) {
  return fromMonth <= toMonth
    ? ([fromMonth, toMonth] as const)
    : ([toMonth, fromMonth] as const);
}

function monthInRange(month: string, fromMonth: string, toMonth: string) {
  return month >= fromMonth && month <= toMonth;
}

function monthsInRange(fromMonth: string, toMonth: string) {
  const [from, to] = normalizeMonthRange(fromMonth, toMonth);
  const months: string[] = [];
  let cursor = from;

  while (cursor <= to) {
    months.push(cursor);
    cursor = addIsoMonths(cursor, 1);
  }

  return months;
}

function monthStart(month: string) {
  return `${month}-01`;
}

function mergeById<T extends { id: string }>(currentItems: T[], nextItems: T[]) {
  const itemsById = new Map(currentItems.map((item) => [item.id, item]));

  nextItems.forEach((item) => itemsById.set(item.id, item));

  return Array.from(itemsById.values());
}

function sortContributionPlans(plans: ContributionPlan[]) {
  return [...plans].sort(
    (first, second) =>
      first.person.localeCompare(second.person, "nl") ||
      first.depositDay - second.depositDay ||
      first.label.localeCompare(second.label, "nl"),
  );
}

function categoryUsageByCurrentUser(
  transactions: Transaction[],
  currentUserId: string,
) {
  const counts = new Map<string, number>();

  transactions
    .filter((transaction) => transaction.type === "variable")
    .filter(
      (transaction) =>
        !transaction.enteredById || transaction.enteredById === currentUserId,
    )
    .forEach((transaction) => {
      counts.set(
        transaction.categoryId,
        (counts.get(transaction.categoryId) ?? 0) + 1,
      );
    });

  return counts;
}

function preferredVariableCategoryId(
  categories: DashboardData["categories"],
  transactions: Transaction[],
  currentUserId: string,
) {
  const usageCounts = categoryUsageByCurrentUser(transactions, currentUserId);

  return variableCategoryOptions(categories, usageCounts)[0]?.id;
}

function variableCategoryOptions(
  categories: DashboardData["categories"],
  categoryUsageCounts: Map<string, number>,
) {
  return categories
    .filter(
      (category) =>
        (category.kind === "variable" || category.kind === "both") &&
        ![
          "Inleg",
          "Stortingen",
          "Salaris",
          "Extra inkomsten",
          SAVINGS_CATEGORY_NAME,
        ].includes(category.name),
    )
    .sort((first, second) => {
      const usageDifference =
        (categoryUsageCounts.get(second.id) ?? 0) -
        (categoryUsageCounts.get(first.id) ?? 0);

      if (usageDifference !== 0) return usageDifference;

      return (first.sortOrder ?? 0) - (second.sortOrder ?? 0);
    });
}

function transactionCategoryOptions(
  transaction: Transaction,
  categories: DashboardData["categories"],
  variableCategories: DashboardData["categories"],
) {
  const options = categories.filter((category) => {
    if (transaction.type === "fixed") {
      return category.kind === "fixed" || category.kind === "both";
    }

    if (transaction.type === "contribution") {
      return (
        category.id === transaction.categoryId ||
        ["Inleg", "Stortingen"].includes(category.name)
      );
    }

    if (transaction.type === "income") {
      return (
        category.id === transaction.categoryId ||
        category.name === "Salaris" ||
        category.name === "Extra inkomsten"
      );
    }

    if (transaction.type === "sparen") {
      return (
        category.id === transaction.categoryId ||
        category.name === SAVINGS_CATEGORY_NAME
      );
    }

    return false;
  });

  const categoryOptions =
    transaction.type === "variable"
      ? variableCategories
      : options;

  if (categoryOptions.some((category) => category.id === transaction.categoryId)) {
    return categoryOptions;
  }

  const currentCategory = categories.find(
    (category) => category.id === transaction.categoryId,
  );

  return currentCategory ? [currentCategory, ...categoryOptions] : categoryOptions;
}
