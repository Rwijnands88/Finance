"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  type AccountBalanceSnapshot,
  type ContributionKind,
  type ContributionPlan,
  type DashboardData,
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
};

type ActiveSection = "dashboard" | "fixed" | "input" | "month";
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
type ContributionCoverageResult = {
  amount: number;
  expectedVariableTotal: number;
  currentVariableTotal: number;
  historyMonths: number;
  dataDays: number;
  tone: "emerald" | "red" | "zinc";
  text: string;
};

type ExpectedMonthEndForecast = {
  amount: number | null;
  basis: "historical" | "current";
  basisLabel: string;
  expectedRemainingVariable: number;
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
    { id: "dashboard", label: "Dashboard", icon: WalletCards },
    { id: "fixed", label: "Vaste lasten", icon: ListChecks },
    { id: "input", label: "Invoeren", icon: Plus },
    { id: "month", label: "Maand", icon: CalendarDays },
  ] satisfies Array<{
    id: ActiveSection;
    label: string;
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
  const [bookingContributionPlanId, setBookingContributionPlanId] = useState<
    string | null
  >(null);
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
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setChartsReady(true));
    return () => window.cancelAnimationFrame(frame);
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

  const mobileChartsReady = chartsReady && !isDesktopViewport;
  const monthOptions = useMemo(
    () =>
      buildMonthOptions(
        transactions,
        fixedInstances,
        balanceSnapshots,
        initialData.selectedMonth,
      ),
    [balanceSnapshots, fixedInstances, initialData.selectedMonth, transactions],
  );
  const loadedMonths = useMemo(
    () => new Set(loadedMonthKeys),
    [loadedMonthKeys],
  );

  const latestBalanceSnapshot = useMemo(
    () =>
      balanceSnapshots
        .filter((snapshot) => snapshot.accountId === selectedAccountId)
        .filter((snapshot) => snapshot.snapshotDate < monthStart(addIsoMonths(currentMonth, 1)))
        .sort(
          (first, second) =>
            second.snapshotDate.localeCompare(first.snapshotDate),
        )[0],
    [balanceSnapshots, currentMonth, selectedAccountId],
  );
  const viewCopy = isSharedView
    ? {
        label: "Gezamenlijke rekening",
        description:
          "Voor vaste lasten, boodschappen, tanken en alles wat jullie samen betalen.",
        quickTitle: "Gezamenlijke uitgave",
        monthTitle: "Gezamenlijk maandoverzicht",
        monthDescription: `${selectedAccount?.name ?? "Gezamenlijke rekening"} in ${monthLabel(currentMonth)}.`,
      }
    : {
        label: "Mijn rekening",
        description:
          "Alleen prive-uitgaven, inkomen en eigen vaste lasten van de ingelogde gebruiker.",
        quickTitle: "Prive-uitgave",
        monthTitle: "Prive maandoverzicht",
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
    () => totalsByPerson(selectedTransactions, currentMonth),
    [currentMonth, selectedTransactions],
  );
  const categoryPersonRows = useMemo(
    () =>
      categoryTotalsByPerson(
        selectedTransactions.filter((transaction) => transaction.type === "variable"),
        categories,
        currentMonth,
      ),
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
  const ownRemainingContributionTotal = contributionPlanRows
    .filter((plan) => plan.userId === initialData.currentUserId)
    .reduce((total, plan) => total + plan.remaining, 0);
  const today = new Date().toISOString().slice(0, 10);
  const calculatedBalance = latestBalanceSnapshot
    ? latestBalanceSnapshot.balance +
      selectedTransactions
        .filter((transaction) => transaction.date > latestBalanceSnapshot.snapshotDate)
        .filter((transaction) => transaction.date <= today)
        .filter((transaction) => transaction.date < monthStart(addIsoMonths(currentMonth, 1)))
        .reduce((total, transaction) => total + signedTransactionAmount(transaction), 0)
    : null;
  const remainingPersonalIncomeTotal = selectedTransactions
    .filter((transaction) => transaction.type === "income")
    .filter((transaction) => transaction.date.startsWith(currentMonth))
    .filter((transaction) => transaction.date > today)
    .reduce((total, transaction) => total + transaction.amount, 0);
  const expectedMonthEndForecast = useMemo(
    () =>
      buildExpectedMonthEndForecast({
        transactions: selectedTransactions,
        month: currentMonth,
        calculatedBalance,
        remainingIncomeTotal: isSharedView
          ? remainingContributionTotal
          : remainingPersonalIncomeTotal,
        remainingFixedTotal:
          openFixedTotalForCurrentMonth +
          (isSharedView ? 0 : ownRemainingContributionTotal),
      }),
    [
      calculatedBalance,
      currentMonth,
      isSharedView,
      openFixedTotalForCurrentMonth,
      ownRemainingContributionTotal,
      remainingPersonalIncomeTotal,
      remainingContributionTotal,
      selectedTransactions,
    ],
  );
  const expectedMonthEndBalance = expectedMonthEndForecast.amount;
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
    void autoConfirmDueFixedExpenses(currentMonth);
  }, [currentMonth, fixedInstances, recurringExpenses, today]);
  const outgoingTransactionRows = useMemo(
    () =>
      buildOutgoingTransactionRows(
        monthTransactions,
        fixedAgendaItems,
        contributionPlanRows,
        labels,
        currentMonth,
        today,
      ),
    [contributionPlanRows, currentMonth, fixedAgendaItems, labels, monthTransactions, today],
  );
  const fixedTotalForCurrentMonth = fixedAgendaItems.reduce(
    (total, item) => (item.state === "skipped" ? total : total + item.amount),
    0,
  );
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
        incomeTotal: monthTotals.incomeTotal,
        ownMonthlyContributionTotal,
        buffer: cashflowBuffer,
      }),
    [
      cashflowBuffer,
      currentMonth,
      monthTotals.incomeTotal,
      ownMonthlyContributionTotal,
      selectedTransactions,
    ],
  );
  const cashflowEvents = useMemo(() => {
    if (isSharedView) {
      return [
        ...fixedAgendaItems
          .filter((item) => item.canSkip && item.date > today)
          .map((item) => ({
            date: item.date,
            day: item.day,
            amount: -item.amount,
          })),
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

    return [...ownContributionPlanEvents, ...incomeEvents] satisfies CashflowEvent[];
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
        startBalance: calculatedBalance ?? 0,
        month: currentMonth,
        events: cashflowEvents,
      }),
    [
      calculatedBalance,
      cashflowEvents,
      currentMonth,
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
      ? currency(displayedNetTotal)
      : currency(calculatedBalance);
  const dashboardPrimarySubtext =
    calculatedBalance === null
      ? "Deze maand tot nu toe"
      : expectedMonthEndBalance === null
        ? "Huidig saldo"
        : `${currency(expectedMonthEndBalance)} verwacht einde maand`;
  const dashboardMetrics: DashboardMetric[] = isSharedView
    ? [
        {
          icon: <ReceiptText className="h-5 w-5" />,
          label: "Uitgaven",
          value: currency(displayedExpenseTotal),
          tone: "zinc" as const,
        },
        {
          icon: <WalletCards className="h-5 w-5" />,
          label: "Verwacht eindsaldo",
          value:
            expectedMonthEndBalance === null
              ? currency(displayedNetTotal)
              : currency(expectedMonthEndBalance),
          detail: expectedMonthEndForecast.basisLabel,
          tone:
            expectedMonthEndBalance !== null && expectedMonthEndBalance < 0
              ? "red"
              : "emerald",
        },
        {
          icon: <ArrowDownToLine className="h-5 w-5" />,
          label: "Stortingen",
          value: currency(monthTotals.contributionTotal),
          tone: "emerald" as const,
        },
      ]
    : [
        {
          icon: <ReceiptText className="h-5 w-5" />,
          label: "Uitgaven",
          value: currency(displayedExpenseTotal),
          tone: "zinc" as const,
        },
        {
          icon: <WalletCards className="h-5 w-5" />,
          label: "Verwacht eindsaldo",
          value:
            expectedMonthEndBalance === null
              ? currency(displayedNetTotal)
              : currency(expectedMonthEndBalance),
          detail: expectedMonthEndForecast.basisLabel,
          tone:
            expectedMonthEndBalance !== null && expectedMonthEndBalance < 0
              ? "red"
              : "indigo",
        },
        {
          icon: <ArrowDownToLine className="h-5 w-5" />,
          label: "Inkomen",
          value: currency(monthTotals.incomeTotal),
          tone: "emerald" as const,
        },
      ];
  const fixedCategories = useMemo(
    () =>
      categories.filter(
        (category) => category.kind === "fixed" || category.kind === "both",
      ),
    [categories],
  );

  async function loadMonthData(month: string) {
    if (loadedMonths.has(month)) {
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

      setTransactions((items) =>
        mergeById(items, transactionsResult.transactions ?? []).sort((a, b) =>
          b.date.localeCompare(a.date),
        ),
      );
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
    const contributionMember =
      initialData.householdMembers.find(
        (member) => member.userId === contributionPaidById,
      ) ??
      initialData.householdMembers.find(
        (member) => member.userId === initialData.currentUserId,
      );

    if (!amount || amount <= 0 || !defaultAccount || !contributionMember) {
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
        accountId: defaultAccount.id,
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
        accountId: defaultAccount.id,
        accountName: defaultAccount.name,
        accountKind: defaultAccount.kind,
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
    setSelectedAccountId(defaultAccount.id);
    setQuickAccount(defaultAccount.id);
    return true;
  }

  async function bookExpectedContributionPlan(plan: ContributionPlanRow) {
    if (!defaultAccount || plan.remaining <= 0) {
      setMonthMessage("Deze verwachte storting kan niet geboekt worden.");
      return;
    }

    const transactionDate = dateForBillingDay(currentMonth, plan.depositDay);
    const note = plan.label || "Geplande storting";

    setBookingContributionPlanId(plan.id);
    setMonthMessage("");

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

    setBookingContributionPlanId(null);

    if (!response.ok) {
      setMonthMessage(
        typeof result.error === "string"
          ? result.error
          : "Storting boeken lukte niet. Probeer het nog eens.",
      );
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

    setTransactions((items) => [
      {
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
      },
      ...items,
    ]);
    setSelectedAccountId(defaultAccount.id);
    setQuickAccount(defaultAccount.id);
    setMonthMessage(`${plan.label || "Storting"} geboekt.`);
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
    setMonthMessage("Uitgave bijgewerkt.");
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
    const wasEditing = Boolean(editingRecurringId);

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
      exportTotals.variableTotal;
    const summaryRows = [
      {
        Rekening: selectedAccount?.name ?? viewCopy.label,
        Maand: monthLabel(targetMonth),
        Stortingen: exportTotals.contributionTotal,
        Inkomen: exportTotals.incomeTotal,
        "Vaste lasten": exportFixedTotal,
        Variabel: exportTotals.variableTotal,
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
            : "Variabel",
      Categorie:
        transaction.type === "contribution"
          ? contributionDisplayName(transaction)
          : transaction.type === "income"
            ? labels.get(transaction.categoryId)?.name ?? "Inkomen"
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
        "Over/tekort",
      ],
      widths: {
        Rekening: 26,
        Maand: 18,
        Stortingen: 15,
        Inkomen: 15,
        "Vaste lasten": 15,
        Variabel: 15,
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
        totals.variableTotal;

      return {
        Rekening: selectedAccount?.name ?? viewCopy.label,
        Maand: monthLabel(month),
        Stortingen: totals.contributionTotal,
        Inkomen: totals.incomeTotal,
        "Vaste lasten": fixedTotal,
        Variabel: totals.variableTotal,
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
            : "Variabel",
      Categorie:
        transaction.type === "contribution"
          ? contributionDisplayName(transaction)
          : transaction.type === "income"
            ? labels.get(transaction.categoryId)?.name ?? "Inkomen"
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
        "Over/tekort",
      ],
      widths: {
        Rekening: 26,
        Maand: 18,
        Stortingen: 15,
        Inkomen: 15,
        "Vaste lasten": 15,
        Variabel: 15,
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

  return (
    <main className="min-h-dvh bg-[var(--bg-base)] pb-[calc(96px+env(safe-area-inset-bottom))] text-[var(--text-primary)] lg:pb-0">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-4 sm:px-6 lg:px-8 2xl:px-10">
        <MobileBottomNav
          activeSection={activeSection}
          onSectionChange={(section) => {
            setActiveSection(section);
            window.scrollTo({ top: 0, behavior: "auto" });
          }}
        />

        <section
          className={cn(
            "finance-view gap-4 lg:hidden",
            activeSection === "dashboard" ? "grid" : "hidden",
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
                Finance
              </h1>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Familie Wijnands
              </p>
            </div>
            <Badge className="border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
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

          <DashboardHero
            label={viewCopy.label}
            value={dashboardPrimaryValue}
            subtext={dashboardPrimarySubtext}
            metrics={dashboardMetrics.slice(0, 3)}
            mobile
          />
          <CashflowTimelineCard
            points={cashflowTimeline}
            buffer={cashflowBuffer}
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
          <MobileSectionHeader title="Vaste lasten" subtitle={monthLabel(currentMonth)} />
          <FixedExpenseAgenda
            items={fixedAgendaItems}
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

        <section
          className={cn(
            "finance-view gap-4 lg:hidden",
            activeSection === "input" ? "grid" : "hidden",
          )}
        >
          <MobileSectionHeader title="Invoeren" subtitle={viewCopy.label} />
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
            balanceAmount={balanceAmount}
            balanceDate={balanceDate}
            balanceMessage={balanceMessage}
            isSavingBalance={isSavingBalance}
            incomeAmount={incomeAmount}
            incomeDate={incomeDate}
            incomeKind={incomeKind}
            incomeNote={incomeNote}
            incomeMessage={incomeMessage}
            isSavingIncome={isSavingIncome}
            showIncomeForm={!isSharedView}
            coverage={!isSharedView ? personalContributionCoverage : undefined}
            onBalanceAmountChange={setBalanceAmount}
            onBalanceDateChange={setBalanceDate}
            onSaveBalance={saveBalanceSnapshot}
            onDeleteBalance={deleteBalanceSnapshot}
            onIncomeAmountChange={setIncomeAmount}
            onIncomeDateChange={setIncomeDate}
            onIncomeKindChange={setIncomeKind}
            onIncomeNoteChange={setIncomeNote}
            onAddIncome={addIncome}
          />
          {isSharedView && (
            <ContributionCard
              amount={contributionAmount}
              date={contributionDate}
              kind={contributionKind}
              note={contributionNote}
              paidById={contributionPaidById}
              person={initialData.currentPerson}
              householdMembers={initialData.householdMembers}
              plans={contributionPlanRows}
              planDrafts={contributionPlanDrafts}
              newPlanDrafts={newContributionPlanDrafts}
              planMessage={contributionPlanMessage}
              savingPlanId={savingContributionPlanId}
              plannedTotal={plannedContributionTotal}
              receivedTotal={monthTotals.contributionTotal}
              extraTotal={extraContributionTotal}
              taxReturnTotal={taxReturnContributionTotal}
              remainingTotal={remainingContributionTotal}
              breakdown={contributionBreakdown}
              coverage={contributionCoverage}
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
          )}
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
            deletingTransactionId={deletingTransactionId}
            bookingContributionPlanId={bookingContributionPlanId}
            onDeleteTransaction={deleteTransaction}
            onBookExpectedContribution={bookExpectedContributionPlan}
          />
          <MonthSummaryCard
            title={viewCopy.monthTitle}
            description={viewCopy.monthDescription}
            currentMonth={currentMonth}
            totals={monthTotals}
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
                buffer={cashflowBuffer}
                onBufferChange={(value) =>
                  updateCashflowBuffer(selectedAccountId, value)
                }
              />

              <MonthInsightsSection
                currentMonth={currentMonth}
                monthTitle={viewCopy.monthTitle}
                monthDescription={viewCopy.monthDescription}
                outgoingRows={outgoingTransactionRows}
                totals={monthTotals}
                monthMessage={monthMessage}
                categoryRows={categoryRows}
                selectedSixMonthTrend={selectedSixMonthTrend}
                chartsReady={chartsReady}
                monthOptions={monthOptions}
                deletingTransactionId={deletingTransactionId}
                bookingContributionPlanId={bookingContributionPlanId}
                onMonthChange={changeCurrentMonth}
                onExportExcel={exportExcel}
                onExportPdf={(month) => void exportPdf(month)}
                onDeleteTransaction={deleteTransaction}
                onBookExpectedContribution={bookExpectedContributionPlan}
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
            </div>
          </section>

          <aside
            data-finance-context
            className="scrollbar-hidden grid h-full min-h-0 content-start gap-4 overflow-y-auto pr-1"
          >
            <AccountBalanceCard
              accountName={selectedAccount?.name ?? viewCopy.label}
              snapshot={latestBalanceSnapshot}
              balanceAmount={balanceAmount}
              balanceDate={balanceDate}
              balanceMessage={balanceMessage}
              isSavingBalance={isSavingBalance}
              incomeAmount={incomeAmount}
              incomeDate={incomeDate}
              incomeKind={incomeKind}
              incomeNote={incomeNote}
              incomeMessage={incomeMessage}
              isSavingIncome={isSavingIncome}
              showIncomeForm={!isSharedView}
              coverage={!isSharedView ? personalContributionCoverage : undefined}
              onBalanceAmountChange={setBalanceAmount}
              onBalanceDateChange={setBalanceDate}
              onSaveBalance={saveBalanceSnapshot}
              onDeleteBalance={deleteBalanceSnapshot}
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

            {isSharedView && (
              <ContributionCard
                amount={contributionAmount}
                date={contributionDate}
                kind={contributionKind}
                note={contributionNote}
                paidById={contributionPaidById}
                person={initialData.currentPerson}
                householdMembers={initialData.householdMembers}
                plans={contributionPlanRows}
                planDrafts={contributionPlanDrafts}
                newPlanDrafts={newContributionPlanDrafts}
                planMessage={contributionPlanMessage}
                savingPlanId={savingContributionPlanId}
                plannedTotal={plannedContributionTotal}
                receivedTotal={monthTotals.contributionTotal}
                extraTotal={extraContributionTotal}
                taxReturnTotal={taxReturnContributionTotal}
                remainingTotal={remainingContributionTotal}
                breakdown={contributionBreakdown}
                coverage={contributionCoverage}
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
            )}

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

type OutgoingTransactionRow = {
  id: string;
  date: string;
  title: string;
  subtitle: string;
  amount: number;
  signedAmount: number;
  kind: "fixed" | "variable" | "contribution" | "income";
  color: string;
  receiptUrl?: string;
  state?: FixedAgendaState;
  transaction?: Transaction;
  expectedContributionPlan?: ContributionPlanRow;
  isExpected?: boolean;
};

function MobileBottomNav({
  activeSection,
  onSectionChange,
}: {
  activeSection: ActiveSection;
  onSectionChange: (section: ActiveSection) => void;
}) {
  const items = sectionNavItems();

  return (
    <nav className="finance-bottom-nav fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 items-start border-t border-[var(--border)] lg:hidden">
      {items.map((item) => {
        const isActive = activeSection === item.id;
        const Icon = item.icon;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSectionChange(item.id)}
            className={cn(
              "min-w-0 rounded-[12px] text-[11px] font-medium leading-none",
              isActive
                ? "text-[var(--accent)]"
                : "text-[var(--text-muted)]",
            )}
            aria-label={item.label}
          >
            <Icon className="h-6 w-6 shrink-0" />
            {isActive && <span className="max-w-full truncate">{item.label}</span>}
          </button>
        );
      })}
    </nav>
  );
}

function MobileSectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
          {title}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{subtitle}</p>
      </div>
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
    <div className="flex w-full gap-1 rounded-[var(--radius-chip)] bg-[var(--bg-surface)] p-1">
      {tabs.map((tab) => {
        const isActive = selectedAccountId === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={cn(
              "min-w-0 flex-1 rounded-[var(--radius-chip)] px-[18px] py-1.5 text-center text-sm font-medium",
              isActive
                ? "bg-[var(--accent-light)] text-[var(--accent)]"
                : "text-[var(--text-secondary)] hover:bg-white/[0.04]",
            )}
          >
            <span className="block truncate">{tab.label}</span>
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
    <section className="finance-card rounded-[var(--radius-card)] border border-[var(--border)] bg-[linear-gradient(135deg,#191924,#13131C)] p-5 shadow-[0_0_80px_rgba(99,102,241,0.07)_inset]">
      <div className={cn("grid gap-5", mobile ? "text-center" : "lg:grid-cols-[1fr_auto] lg:items-end")}>
        <div>
          <p className="text-sm font-medium text-[var(--text-secondary)] lg:text-xs">
            {label}
          </p>
          <p
            className={cn(
              "mt-2 font-bold tracking-normal text-[var(--text-primary)]",
              mobile ? "text-[44px]" : "text-[32px]",
            )}
          >
            {value}
          </p>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            {subtext}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-[14px] border border-[var(--border)] bg-black/10 p-3 text-left"
            >
              <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-light)] text-[var(--accent)]">
                {metric.icon}
              </div>
              <p className="truncate text-lg font-semibold text-[var(--text-primary)]">
                {metric.value}
              </p>
              <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                {metric.label}
              </p>
              {metric.detail && (
                <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--text-muted)]">
                  {metric.detail}
                </p>
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
  buffer,
  onBufferChange,
  compact = false,
}: {
  points: CashflowPoint[];
  buffer: number;
  onBufferChange: (value: number) => void;
  compact?: boolean;
}) {
  const insight = cashflowInsight(points, buffer);

  return (
    <Card className="finance-card">
      <CardHeader className={cn("pb-3", compact && "text-left")}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Cashflow</CardTitle>
            <CardDescription>Lopend saldo deze maand</CardDescription>
          </div>
          <div className="w-24">
            <label className="grid gap-1 text-[11px] font-medium uppercase text-[var(--text-muted)]">
              Buffer
              <Input
                inputMode="decimal"
                value={String(buffer)}
                className="h-8 rounded-[10px] px-2 text-right text-xs"
                onChange={(event) => {
                  const value = Number(event.target.value.replace(",", "."));
                  onBufferChange(Number.isFinite(value) && value >= 0 ? value : 0);
                }}
              />
            </label>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-32">
          <CashflowSvgChart points={points} buffer={buffer} />
        </div>
        <CashflowLegend />
        <p className="rounded-[12px] border border-[var(--border)] bg-[var(--bg-surface)] p-3 text-sm leading-5 text-[var(--text-secondary)]">
          {insight.text}
        </p>
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

function CashflowSvgChart({
  points,
  buffer,
}: {
  points: CashflowPoint[];
  buffer: number;
}) {
  const segments = cashflowLineSegments(points, buffer);
  const firstPoint = points[0];

  if (!points.length) {
    return (
      <div className="flex h-full items-center justify-center rounded-[12px] border border-dashed border-[var(--border)] bg-black/10 text-xs text-[var(--text-muted)]">
        Nog geen cashflowpunten.
      </div>
    );
  }

  return (
    <svg
      viewBox="0 0 320 112"
      role="img"
      aria-label="Cashflowlijn deze maand"
      className="h-full w-full overflow-visible"
      preserveAspectRatio="none"
    >
      <line
        x1="8"
        y1="104"
        x2="312"
        y2="104"
        stroke="rgba(255,255,255,0.07)"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      {segments.map((segment) => (
        <line
          key={segment.id}
          x1={segment.x1}
          y1={segment.y1}
          x2={segment.x2}
          y2={segment.y2}
          stroke={segment.color}
          strokeWidth="3"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {segments.length === 0 && firstPoint && (
        <circle
          cx="160"
          cy="56"
          r="4"
          fill={cashflowLineColor(firstPoint.balance, buffer)}
        />
      )}
    </svg>
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
  onSelect,
  onSectionChange,
}: {
  tabs: Array<{ id: string; label: string; description: string }>;
  selectedAccountId: string;
  currentPerson: string;
  activeSection: ActiveSection;
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
  title,
  description,
  currentMonth,
  totals,
  monthMessage,
  onExportExcel,
  onExportPdf,
}: {
  title: string;
  description: string;
  currentMonth: string;
  totals: ReturnType<typeof totalsForMonth>;
  monthMessage: string;
  onExportExcel: (month: string) => void;
  onExportPdf: (month: string) => void;
}) {
  const summaryRows = [
    {
      label: "Uitgaven",
      value: totals.expenseTotal,
      tone: "red" as const,
      detail: "Vaste lasten + variabel",
    },
    {
      label: "Stortingen",
      value: totals.contributionTotal,
      tone: "emerald" as const,
      detail: "Op de gezamenlijke rekening",
    },
    {
      label: "Inkomen",
      value: totals.incomeTotal,
      tone: "emerald" as const,
      detail: "Salaris en extra inkomsten",
    },
  ];

  return (
    <Card className="finance-card">
      <CardHeader className="grid gap-3 pb-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
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

        <div className="grid gap-2 sm:grid-cols-3">
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

function AllTransactionsCard({
  currentMonth,
  rows,
  deletingTransactionId,
  bookingContributionPlanId,
  onDeleteTransaction,
  onBookExpectedContribution,
}: {
  currentMonth: string;
  rows: OutgoingTransactionRow[];
  deletingTransactionId: string | null;
  bookingContributionPlanId: string | null;
  onDeleteTransaction: (transaction: Transaction) => void;
  onBookExpectedContribution: (plan: ContributionPlanRow) => void;
}) {
  const total = rows.reduce((sum, row) => sum + row.signedAmount, 0);

  return (
    <Card className="finance-card overflow-hidden">
      <CardHeader className="grid gap-3 pb-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <CardTitle>Alle transacties</CardTitle>
          <CardDescription>
            Alle transacties en verwachte afschrijvingen deze maand.
          </CardDescription>
        </div>
        <Badge className="w-fit border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
          Netto {currency(total)}
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length > 0 ? (
          <div className="divide-y divide-[var(--border)]">
            {rows.map((row) => {
              const isUpcoming =
                row.state === "today" || row.state === "upcoming";
              const isDeleting =
                !!row.transaction && deletingTransactionId === row.transaction.id;
              const isBooking =
                !!row.expectedContributionPlan &&
                bookingContributionPlanId === row.expectedContributionPlan.id;

              return (
                <div
                  key={row.id}
                  className={cn(
                    "group/transaction grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-5",
                    row.isExpected &&
                      "border-l-2 border-dashed border-l-[var(--positive)] bg-[var(--positive-light)]/40 text-[var(--text-secondary)]",
                  )}
                >
                  <div className="text-center">
                    <p className="text-[11px] font-medium uppercase text-[var(--text-muted)]">
                      {new Intl.DateTimeFormat("nl-NL", {
                        month: "short",
                      }).format(new Date(`${row.date}T00:00:00`))}
                    </p>
                    <p className="text-base font-semibold text-[var(--text-primary)]">
                      {Number(row.date.slice(8, 10))}
                    </p>
                  </div>
                  <div className="flex min-w-0 items-center gap-3">
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
                  <div className="flex min-w-fit items-center justify-end gap-2 text-right">
                    <div>
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
                    {row.expectedContributionPlan && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 px-3 text-xs"
                        disabled={isBooking}
                        onClick={() =>
                          onBookExpectedContribution(row.expectedContributionPlan!)
                        }
                      >
                        {isBooking ? (
                          <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Boeken
                      </Button>
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
                  </div>
                </div>
              );
            })}
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
        : labels.get(transaction.categoryId)?.name ?? "Uitgave";

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
              Uitgave wijzigen
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
}: {
  receiptUrl: string;
  title: string;
  onOpen: (receipt: ReceiptViewerState) => void;
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
      className="group flex shrink-0 items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] disabled:cursor-wait disabled:opacity-50"
      title={signedUrl ? "Bekijk bon" : "Bon laden"}
    >
      <ReceiptText className="h-3.5 w-3.5 text-[var(--accent)]" />
      <span>Bon</span>
      {signedUrl && (
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
  monthTitle,
  monthDescription,
  outgoingRows,
  totals,
  monthMessage,
  categoryRows,
  selectedSixMonthTrend,
  chartsReady,
  deletingTransactionId,
  bookingContributionPlanId,
  onMonthChange,
  onExportExcel,
  onExportPdf,
  onDeleteTransaction,
  onBookExpectedContribution,
}: {
  currentMonth: string;
  monthOptions: MonthOption[];
  monthTitle: string;
  monthDescription: string;
  outgoingRows: OutgoingTransactionRow[];
  totals: ReturnType<typeof totalsForMonth>;
  monthMessage: string;
  categoryRows: ReturnType<typeof categoryTotals>;
  selectedSixMonthTrend: ReturnType<typeof sixMonthTrend>;
  chartsReady: boolean;
  deletingTransactionId: string | null;
  bookingContributionPlanId: string | null;
  onMonthChange: (month: string) => void;
  onExportExcel: (month: string) => void;
  onExportPdf: (month: string) => void;
  onDeleteTransaction: (transaction: Transaction) => void;
  onBookExpectedContribution: (plan: ContributionPlanRow) => void;
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
        deletingTransactionId={deletingTransactionId}
        bookingContributionPlanId={bookingContributionPlanId}
        onDeleteTransaction={onDeleteTransaction}
        onBookExpectedContribution={onBookExpectedContribution}
      />

      <div className="grid items-start gap-4 2xl:grid-cols-[minmax(460px,0.95fr)_minmax(0,1.05fr)]">
        <MonthSummaryCard
          title={monthTitle}
          description={monthDescription}
          currentMonth={currentMonth}
          totals={totals}
          monthMessage={monthMessage}
          onExportExcel={onExportExcel}
          onExportPdf={onExportPdf}
        />
        <ChartsPanel
          categoryRows={categoryRows}
          selectedSixMonthTrend={selectedSixMonthTrend}
          chartsReady={chartsReady}
          featured
        />
      </div>
    </section>
  );
}

function ChartsPanel({
  categoryRows,
  selectedSixMonthTrend,
  chartsReady,
  featured = false,
  showTrend = true,
}: {
  categoryRows: ReturnType<typeof categoryTotals>;
  selectedSixMonthTrend: ReturnType<typeof sixMonthTrend>;
  chartsReady: boolean;
  featured?: boolean;
  showTrend?: boolean;
}) {
  const totalCategories = categoryRows.reduce((total, row) => total + row.amount, 0);
  const hasCategoryData = totalCategories > 0;
  const topCategory = categoryRows[0];
  const visibleCategoryRows = featured ? categoryRows.slice(0, 5) : categoryRows;
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
      )}
    >
      <Card className="finance-card overflow-hidden">
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
            featured
              ? "md:grid-cols-[220px_minmax(0,1fr)]"
              : "md:grid-cols-[0.72fr_1.28fr] lg:grid-cols-1",
          )}
        >
          <div className={cn("relative overflow-visible", hasCategoryData ? "h-48" : "h-36")}>
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
                  >
                    {categoryRows.map((entry) => (
                      <Cell key={entry.categoryId} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => currency(Number(value))}
                    contentStyle={tooltipStyle}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
            {hasCategoryData ? (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <p className="text-[11px] text-[var(--text-muted)]">Totaal</p>
                <p className="text-lg font-semibold text-[var(--text-primary)]">
                  {currency(totalCategories)}
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
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: topCategory.color }}
                    />
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
            {visibleCategoryRows.filter((row) => row.amount > 0).map((row) => {
              const overBudget = row.average > 0 && row.amount > row.average;

              return (
                <div
                  key={row.categoryId}
                  className="grid grid-cols-[minmax(5rem,1fr)_minmax(80px,200px)_auto] items-center gap-3 text-xs"
                >
                  <span className="flex min-w-0 items-center gap-2 text-[var(--text-secondary)]">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: row.color }}
                    />
                    <span className="truncate">{row.name}</span>
                  </span>
                  <CategoryProgressBar
                    value={row.amount}
                    max={row.average || row.amount}
                    color={overBudget ? "#EF4444" : row.color}
                    className="max-w-[200px]"
                  />
                  <span
                    className={cn(
                      "font-medium",
                      overBudget ? "text-[var(--negative)]" : "text-[var(--positive)]",
                    )}
                  >
                    {currency(row.amount)}
                  </span>
                </div>
              );
            })}
            {featured && categoryRows.length > visibleCategoryRows.length && (
              <p className="text-xs text-[var(--text-muted)]">
                Plus {categoryRows.length - visibleCategoryRows.length} kleinere categorieen.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

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
                <Bar dataKey="variable" fill="var(--positive)" radius={[8, 8, 3, 3]} />
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
            <span className="h-2 w-2 rounded-full bg-[var(--positive)]" />
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
  currentMonth,
  message,
  highlightedId,
  skippingId,
  onSkip,
  compact = false,
}: {
  items: FixedAgendaItem[];
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
          <AgendaTotal label="Verwerkt" value={processedTotal} tone="emerald" />
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
  currentMonth,
  highlightedId,
}: {
  items: FixedAgendaItem[];
  currentMonth: string;
  highlightedId?: string | null;
}) {
  const [year, monthNumber] = currentMonth.split("-").map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const firstDay = new Date(year, monthNumber - 1, 1).getDay();
  const leadingBlanks = firstDay === 0 ? 6 : firstDay - 1;
  const itemsByDay = new Map<number, FixedAgendaItem[]>();

  items.forEach((item) => {
    const dayItems = itemsByDay.get(item.day) ?? [];
    dayItems.push(item);
    itemsByDay.set(item.day, dayItems);
  });

  const cells = [
    ...Array.from({ length: leadingBlanks }, (_, index) => ({
      key: `blank-${index}`,
      day: null as number | null,
      items: [] as FixedAgendaItem[],
    })),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;

      return {
        key: `day-${day}`,
        day,
        items: itemsByDay.get(day) ?? [],
      };
    }),
  ];

  return (
    <div className="hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-surface)] p-4 lg:block">
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
          const isHighlighted = cell.items.some((item) => item.id === highlightedId);
          const hasProcessed = cell.items.some((item) =>
            isProcessedAgendaState(item.state),
          );

          return (
            <div
              key={cell.key}
              className={cn(
                "min-h-12 rounded-[10px] border border-transparent p-1.5 text-xs transition",
                cell.day && "hover:bg-[var(--bg-card-hover)]",
                hasItems && "border-[var(--border)] bg-[var(--accent-light)]",
                isHighlighted && "border-[var(--accent)]",
              )}
            >
              {cell.day && (
                <>
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium text-[var(--text-secondary)]">
                      {cell.day}
                    </span>
                    {hasItems && (
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full bg-[var(--accent)]",
                          hasProcessed && "bg-[var(--positive)]",
                        )}
                      />
                    )}
                  </div>
                  {hasItems && (
                    <p className="mt-1 truncate text-[10px] font-medium text-[var(--text-primary)]">
                      {currency(
                        cell.items.reduce((total, item) => total + item.amount, 0),
                      )}
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
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
  tone: "indigo" | "emerald" | "zinc";
}) {
  return (
    <div
      className={cn(
        "rounded-[14px] border p-3",
        tone === "indigo" && "border-[var(--border-strong)] bg-[var(--accent-light)]",
        tone === "emerald" && "border-emerald-400/20 bg-[var(--positive-light)]",
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
            isProcessed && "bg-[var(--positive)] opacity-40",
          )}
        />
        <div
          className={cn(
            "z-10 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[13px] font-medium text-[var(--text-secondary)]",
            isProcessed && "border-emerald-400/20 bg-[var(--positive-light)] text-[var(--positive)]",
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
  const [isManagerOpen, setIsManagerOpen] = useState(false);
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
  const showManager = Boolean(editingId) || isManagerOpen;
  const showForm = Boolean(editingId) || isFormOpen;
  const monthlyTotal = activeExpenses.reduce(
    (total, expense) => total + expense.currentAmount,
    0,
  );

  return (
    <Card className="h-full">
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
      {showManager && (
      <CardContent className="space-y-5">
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
  const maxPersonTotal = Math.max(
    ...people.map((person) => personTotals[person] ?? 0),
    1,
  );
  const title = isSharedView
    ? "Gezamenlijke uitgaven per persoon"
    : "Mijn toegevoegde uitgaven";
  const description = isSharedView
    ? "Wie voegde deze maand welke gezamenlijke uitgaven toe."
    : "Prive-uitgaven op deze rekening, uitgesplitst waar mogelijk.";
  const topRows = categoryRows.slice(0, 3);

  return (
    <Card className="bg-[#141416]">
      <CardHeader className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Badge className="w-fit border-zinc-800 bg-zinc-950/60 text-zinc-400">
          variabel
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
          {people.map((person) => {
            const value = personTotals[person] ?? 0;
            const percentage = maxPersonTotal > 0 ? (value / maxPersonTotal) * 100 : 0;

            return (
              <div
                key={person}
                className="rounded-[13px] border border-zinc-800/70 bg-zinc-950/35 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        person === "Ralph" ? "bg-indigo-500" : "bg-emerald-500",
                      )}
                    />
                    <span className="truncate text-sm text-zinc-300">
                      {person}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-zinc-50">
                    {currency(value)}
                  </span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-900">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      person === "Ralph" ? "bg-indigo-500" : "bg-emerald-500",
                    )}
                    style={{ width: `${percentage}%` }}
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

          {topRows.map((row) => (
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
                {row.people.map((personRow) => (
                  <div
                    key={personRow.person}
                    className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-xs"
                  >
                    <span className="truncate text-zinc-500">
                      {personRow.person}
                    </span>
                    <CategoryProgressBar
                      value={personRow.amount}
                      max={row.total}
                      color={row.color}
                    />
                    <span className="text-zinc-300">
                      {currency(personRow.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
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
  balanceAmount,
  balanceDate,
  balanceMessage,
  isSavingBalance,
  incomeAmount,
  incomeDate,
  incomeKind,
  incomeNote,
  incomeMessage,
  isSavingIncome,
  showIncomeForm,
  coverage,
  onBalanceAmountChange,
  onBalanceDateChange,
  onSaveBalance,
  onDeleteBalance,
  onIncomeAmountChange,
  onIncomeDateChange,
  onIncomeKindChange,
  onIncomeNoteChange,
  onAddIncome,
}: {
  accountName: string;
  snapshot?: AccountBalanceSnapshot;
  balanceAmount: string;
  balanceDate: string;
  balanceMessage: string;
  isSavingBalance: boolean;
  incomeAmount: string;
  incomeDate: string;
  incomeKind: "salary" | "extra";
  incomeNote: string;
  incomeMessage: string;
  isSavingIncome: boolean;
  showIncomeForm: boolean;
  coverage?: ContributionCoverageResult;
  onBalanceAmountChange: (value: string) => void;
  onBalanceDateChange: (value: string) => void;
  onSaveBalance: () => void;
  onDeleteBalance: (snapshot: AccountBalanceSnapshot) => void;
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
  coverage: ContributionCoverageResult;
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
          Wat er deze maand op de gezamenlijke rekening binnenkomt.
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
            <span className="text-[var(--text-secondary)]">
              Geplande stortingen {currency(plannedTotal)}
            </span>
            <span
              className={cn(
                "text-right",
                remainingTotal > 0 ? "text-[var(--accent)]" : "text-[var(--positive)]",
              )}
            >
              Nog {currency(remainingTotal)}
            </span>
          </div>
        </div>

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
                        {isComplete ? "op schema" : currency(plan.remaining)}
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

        <ContributionBreakdownList people={breakdown} />

        <div className="grid grid-cols-2 gap-2 text-sm">
          <ContributionStat
            label="Nog verwacht"
            value={currency(remainingTotal)}
            tone={remainingTotal > 0 ? "indigo" : "emerald"}
          />
          <ContributionStat
            label="Extra stortingen"
            value={currency(extraTotal)}
            tone={extraTotal > 0 ? "emerald" : "zinc"}
          />
          <ContributionStat
            label="Belastingteruggave"
            value={currency(taxReturnTotal)}
            tone={taxReturnTotal > 0 ? "emerald" : "zinc"}
          />
          <ContributionCoverageCard coverage={coverage} />
        </div>

        {planMessage && (
          <p className="rounded-[12px] border border-[var(--border)] bg-[var(--bg-surface)] p-3 text-sm text-[var(--text-secondary)]">
            {planMessage}
          </p>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="secondary"
            className="h-10 justify-center border-emerald-400/20 text-emerald-200 hover:border-emerald-400/30 hover:bg-emerald-500/10"
            onClick={() => setIsBookingOpen(true)}
          >
            <ArrowDownToLine className="h-4 w-4" />
            Storting boeken
          </Button>
        </div>

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
	                <div key={member.userId} className="grid gap-2 rounded-[12px] bg-[var(--bg-surface)] p-2">
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
	                      <div key={plan.id} className="grid gap-2 rounded-[10px] bg-black/10 p-2">
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
        aria-label="Storting boeken"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-[24px] border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-2xl sm:max-w-md sm:rounded-[24px] sm:p-5"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Storting boeken
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Losse storting op de gezamenlijke rekening.
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
              className="h-10"
              onChange={(event) => onDateChange(event.target.value)}
            />
          </FieldLabel>

          <div className="grid gap-2">
            <p className="text-xs font-medium text-zinc-500">Type</p>
            <div className="grid grid-cols-3 gap-1 rounded-[16px] bg-[var(--bg-surface)] p-1">
              {(["extra", "planned", "belastingteruggave"] as const).map((item) => (
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
  const customVariableCategories = variableCategories.filter(
    (item) => (item.sortOrder ?? 0) >= 200,
  );

  return (
    <Card className="finance-card max-w-full overflow-hidden lg:max-w-[480px]">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Bedrag erin, categorie kiezen, klaar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex min-h-20 cursor-pointer items-center justify-center gap-3 rounded-[16px] border border-indigo-400/30 bg-indigo-500/15 px-4 text-base font-semibold text-indigo-100 transition hover:bg-indigo-500/20 sm:hidden">
          {isScanningReceipt ? (
            <LoaderCircle className="h-7 w-7 animate-spin" />
          ) : (
            <Camera className="h-7 w-7" />
          )}
          {isScanningReceipt ? "Bon wordt gelezen..." : "Bon scannen"}
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
              "rounded-[12px] border p-3 text-sm sm:hidden",
              isScanningReceipt
                ? "border-indigo-400/20 bg-indigo-500/10 text-indigo-100"
                : "border-zinc-800 bg-zinc-950/70 text-zinc-300",
            )}
          >
            {scanMessage}
          </p>
        )}

        {receiptDraft && (
          <div className="grid gap-3 rounded-[16px] border border-indigo-400/25 bg-indigo-500/10 p-3 sm:hidden">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-50">
                  Bon overgenomen
                </p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Controleer de velden, kies categorie en sla op.
                </p>
              </div>
              <Badge className="border-indigo-400/25 bg-indigo-500/15 text-indigo-100">
                scan
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-2">
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
                variant="secondary"
                onClick={onDismissReceiptDraft}
                className="h-10"
              >
                <X className="h-4 w-4" />
                Verberg scan
              </Button>
            </div>
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto sm:hidden">
          {accounts.map((item) => {
            const isActive = account === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onAccountChange(item.id)}
                className={cn(
                  "shrink-0 rounded-[var(--radius-chip)] border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)]",
                  isActive &&
                    "border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent)]",
                )}
              >
                {item.name}
              </button>
            );
          })}
        </div>

        {householdMembers.length > 0 && (
          <div className="flex gap-2 overflow-x-auto sm:hidden">
            {householdMembers.map((member) => {
              const isActive = paidById === member.userId;

              return (
                <button
                  key={member.userId}
                  type="button"
                  onClick={() => onPaidByChange(member.userId)}
                  className={cn(
                    "shrink-0 rounded-[var(--radius-chip)] border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)]",
                    isActive &&
                      "border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent)]",
                  )}
                >
                  Betaald door {member.displayName}
                </button>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 sm:hidden">
          {variableCategories.map((item) => (
            <button
              type="button"
              key={item.id}
              className={cn(
                "flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-[13px] border border-[var(--border)] bg-[var(--bg-surface)] p-2 text-xs font-medium text-[var(--text-secondary)] transition",
                category === item.id &&
                  "border-[var(--accent)] bg-[var(--accent-light)] text-[var(--text-primary)]",
              )}
              onClick={() => onCategoryChange(item.id)}
            >
              <ReceiptText className="h-5 w-5" />
              {item.name}
            </button>
          ))}
        </div>

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

        <details className="group rounded-[14px] border border-[var(--border)] bg-black/10">
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

        <Input
          inputMode="decimal"
          placeholder="Bedrag"
          value={amount}
          className="h-16 text-center text-[40px] font-bold tracking-normal sm:h-11 sm:text-left sm:text-base sm:font-semibold"
          onChange={(event) => onAmountChange(event.target.value)}
        />

        <div className="grid gap-3">
          <Input
            type="date"
            value={date}
            className="h-10"
            onChange={(event) => onDateChange(event.target.value)}
          />
        </div>

        <Textarea
          placeholder="Notitie optioneel"
          value={note}
          className="min-h-16"
          onChange={(event) => onNoteChange(event.target.value)}
        />

        <div className="sticky bottom-3 z-10 flex justify-end pt-2 sm:static">
          <Button className="accent-glow-hover h-14 w-full text-base font-semibold sm:h-11 sm:w-auto sm:text-sm" onClick={onSubmit}>
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
  const supabase = getSupabaseBrowserClient();
  const receiptBlob = await compressReceiptImage(file);
  const receiptPath = `${accountId}/${transactionId}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from("receipts")
    .upload(receiptPath, receiptBlob, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { error: updateError } = await supabase
    .from("transactions")
    .update({ receipt_url: receiptPath })
    .eq("id", transactionId);

  if (updateError) {
    await supabase.storage.from("receipts").remove([receiptPath]);
    throw updateError;
  }

  return receiptPath;
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
  if (transaction.type === "income" || transaction.type === "contribution") {
    return transaction.amount;
  }

  return -transaction.amount;
}

function buildExpectedMonthEndForecast({
  transactions,
  month,
  calculatedBalance,
  remainingIncomeTotal,
  remainingFixedTotal,
}: {
  transactions: Transaction[];
  month: string;
  calculatedBalance: number | null;
  remainingIncomeTotal: number;
  remainingFixedTotal: number;
}): ExpectedMonthEndForecast {
  if (calculatedBalance === null) {
    return {
      amount: null,
      basis: "current",
      basisLabel: "Op basis van deze maand",
      expectedRemainingVariable: 0,
    };
  }

  const daysInMonth = daysInIsoMonth(month);
  const elapsedDays = dataDaysForMonth(month);
  const remainingDays = Math.max(daysInMonth - elapsedDays, 0);
  const currentVariableTotal =
    elapsedDays > 0
      ? variableTotalForMonth(transactions, month, elapsedDays)
      : 0;
  const actualDailyAverage =
    currentVariableTotal / Math.max(elapsedDays, 1);
  const throughDate =
    elapsedDays > 0 ? dateForBillingDay(month, elapsedDays) : null;
  const currentVariableDays = throughDate
    ? new Set(
        transactions
          .filter((transaction) => transaction.type === "variable")
          .filter((transaction) => transaction.date.startsWith(month))
          .filter((transaction) => transaction.date <= throughDate)
          .map((transaction) => transaction.date),
      ).size
    : 0;
  const historicalRows = [1, 2, 3]
    .map((offset) => {
      const historicalMonth = addIsoMonths(month, -offset);

      return {
        total: variableTotalForMonth(transactions, historicalMonth),
        days: daysInIsoMonth(historicalMonth),
      };
    })
    .filter((row) => row.total > 0);
  const historicalDailyAverage =
    historicalRows.reduce((total, row) => total + row.total, 0) /
    Math.max(
      historicalRows.reduce((total, row) => total + row.days, 0),
      1,
    );
  const monthProgress = elapsedDays / Math.max(daysInMonth, 1);
  const hasLittleCurrentData = elapsedDays < 10 || currentVariableDays < 3;
  const useHistoricalAverage =
    monthProgress < 0.5 &&
    hasLittleCurrentData &&
    historicalRows.length >= 2;
  const expectedRemainingVariable =
    remainingDays *
    (useHistoricalAverage ? historicalDailyAverage : actualDailyAverage);

  return {
    amount:
      calculatedBalance +
      remainingIncomeTotal -
      remainingFixedTotal -
      expectedRemainingVariable,
    basis: useHistoricalAverage ? "historical" : "current",
    basisLabel: useHistoricalAverage
      ? "Op basis van historisch gemiddelde"
      : "Op basis van deze maand",
    expectedRemainingVariable,
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
  const daysInMonth = daysInIsoMonth(month);
  const dataDays = dataDaysForMonth(month);
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
  const historicalDailyAverage =
    historicalRows.reduce((total, row) => total + row.total, 0) /
    Math.max(
      historicalRows.reduce((total, row) => total + row.days, 0),
      1,
    );
  const hasForecast = dataDays >= 10 && historyMonths >= 3;
  const expectedVariableTotal = hasForecast
    ? currentVariableTotal + historicalDailyAverage * remainingDays
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
  const daysInMonth = daysInIsoMonth(month);
  const dataDays = dataDaysForMonth(month);
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
  const historicalDailyAverage =
    historicalRows.reduce((total, row) => total + row.total, 0) /
    Math.max(
      historicalRows.reduce((total, row) => total + row.days, 0),
      1,
    );
  const hasForecast = dataDays >= 10 && historyMonths >= 2;
  const expectedVariableTotal = hasForecast
    ? currentVariableTotal + historicalDailyAverage * remainingDays
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
  contributionPlans: ContributionPlanRow[],
  labels: Map<string, DashboardData["categories"][number]>,
  month: string,
  today: string,
) {
  const fixedRows: OutgoingTransactionRow[] = fixedItems
    .filter((item) => item.state !== "skipped")
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
  const positiveRows: OutgoingTransactionRow[] = monthTransactions
    .filter(
      (transaction) =>
        transaction.type === "contribution" || transaction.type === "income",
    )
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
  const expectedContributionRows: OutgoingTransactionRow[] = contributionPlans
    .filter((plan) => plan.remaining > 0)
    .map((plan) => {
      const date = dateForBillingDay(month, plan.depositDay);

      return { plan, date };
    })
    .filter(({ date }) => date <= today)
    .map(({ plan, date }) => ({
      id: `expected-contribution-${plan.id}-${date}`,
      date,
      title: plan.label || "Geplande storting",
      subtitle: `${plan.person} · verwacht`,
      amount: plan.remaining,
      signedAmount: plan.remaining,
      kind: "contribution",
      color: "#10B981",
      expectedContributionPlan: plan,
      isExpected: true,
    }));

  return [...fixedRows, ...variableRows, ...positiveRows, ...expectedContributionRows].sort(
    (first, second) =>
      first.date.localeCompare(second.date) ||
      first.title.localeCompare(second.title, "nl"),
  );
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

function dataDaysForMonth(month: string) {
  const today = new Date().toISOString().slice(0, 10);
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
  startBalance,
  month,
  events,
}: {
  startBalance: number;
  month: string;
  events: CashflowEvent[];
}) {
  const [, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Number(month.slice(0, 4)), monthNumber, 0).getDate();
  const dailyChanges = Array.from({ length: daysInMonth }, () => 0);
  const today = new Date().toISOString().slice(0, 10);
  const startDay = today.startsWith(month)
    ? Number(today.slice(8, 10))
    : 1;
  const startDate = dateForBillingDay(month, startDay);
  const addDailyChange = (day: number, amount: number) => {
    const safeDay = Math.min(Math.max(day, 1), daysInMonth);
    dailyChanges[safeDay - 1] += amount;
  };

  events
    .filter((event) => event.date.startsWith(month))
    .filter((event) => event.date >= startDate)
    .forEach((event) => addDailyChange(event.day, event.amount));

  let runningBalance = startBalance;

  return dailyChanges.slice(startDay - 1).map((amount, index) => {
    const day = startDay + index;

    runningBalance += amount;

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

function cashflowLineSegments(points: CashflowPoint[], buffer: number) {
  const chartWidth = 320;
  const chartHeight = 112;
  const padding = 8;
  const minDay = points[0]?.day ?? 1;
  const maxDay = points.at(-1)?.day ?? minDay;
  const balances = points.map((point) => point.balance);
  const minBalance = Math.min(...balances, buffer, 0);
  const maxBalance = Math.max(...balances, buffer, 0);
  const balanceRange = Math.max(maxBalance - minBalance, 1);
  const dayRange = Math.max(maxDay - minDay, 1);
  const xForDay = (day: number) =>
    padding + ((day - minDay) / dayRange) * (chartWidth - padding * 2);
  const yForBalance = (balance: number) =>
    chartHeight -
    padding -
    ((balance - minBalance) / balanceRange) * (chartHeight - padding * 2);

  return points.slice(1).map((point, index) => {
    const previousPoint = points[index];

    return {
      id: `${previousPoint.day}-${point.day}`,
      color: cashflowLineColor(point.balance, buffer),
      x1: xForDay(previousPoint.day),
      y1: yForBalance(previousPoint.balance),
      x2: xForDay(point.day),
      y2: yForBalance(point.balance),
    };
  });
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
        !["Inleg", "Stortingen", "Salaris", "Extra inkomsten"].includes(category.name),
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
