"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
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
  Smartphone,
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
import { Progress } from "@/components/ui/progress";
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

type BankLauncherState = {
  name: string;
  label: string;
  appUrl: string;
  androidIntentUrl: string;
  webUrl: string;
  badge: string;
  badgeClass: string;
};

type DashboardMetric = {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "indigo" | "emerald" | "red" | "zinc";
};

type ActiveSection = "dashboard" | "fixed" | "input" | "month";
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

const bankLinks: BankLauncherState[] = [
  {
    name: "ING",
    label: "ING",
    appUrl: "ing://",
    androidIntentUrl:
      "intent://open#Intent;scheme=ing;package=com.ing.mobile;S.browser_fallback_url=https%3A%2F%2Fwww.ing.nl%2Fparticulier%2Fbetalen%2Fbankrekeningen%2Fsneakpeak-ing-app;end",
    webUrl: "https://www.ing.nl/particulier/betalen/bankrekeningen/sneakpeak-ing-app",
    badge: "ING",
    badgeClass: "bg-[#ff6200] text-white",
  },
  {
    name: "ABN AMRO",
    label: "ABN",
    appUrl: "abnamro://",
    androidIntentUrl:
      "intent://open#Intent;scheme=abnamro;package=com.abnamro.nl.mobile.payments;S.browser_fallback_url=https%3A%2F%2Fwww.abnamro.nl%2Fnl%2Fprive%2Finternet-en-mobiel%2Fabn-amro-app%2Findex.html;end",
    webUrl:
      "https://www.abnamro.nl/nl/prive/internet-en-mobiel/abn-amro-app/index.html",
    badge: "ABN",
    badgeClass:
      "bg-[linear-gradient(135deg,#008578_0%,#008578_58%,#f6c343_58%,#f6c343_100%)] text-white",
  },
];

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
  if (section === "dashboard") {
    document
      .querySelector<HTMLElement>("[data-finance-context]")
      ?.scrollTo({ top: 0, behavior: "auto" });
    window.scrollTo({ top: 0, behavior: "auto" });
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
      window.scrollTo({ top: 0, behavior: "auto" });
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "auto" });
      });
      return;
    }
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
  const [contributionPlanDrafts, setContributionPlanDrafts] = useState(() =>
    Object.fromEntries(
      initialData.contributionPlans.map((plan) => [
        plan.id,
        {
          amount: String(plan.monthlyAmount || ""),
          depositDay: String(plan.depositDay),
        },
      ]),
    ),
  );
  const [quickCategory, setQuickCategory] = useState(
    initialData.categories.find(
      (category) => category.kind === "variable" && category.name !== "Inleg",
    )?.id ??
      initialData.categories[0]?.id ??
      "",
  );
  const [quickAccount, setQuickAccount] = useState(defaultAccount?.id ?? "");
  const [selectedAccountId, setSelectedAccountId] = useState(
    defaultAccount?.id ?? personalAccount?.id ?? "all",
  );
  const [activeSection, setActiveSection] = useState<ActiveSection>("dashboard");
  const [quickAmount, setQuickAmount] = useState("");
  const [quickDate, setQuickDate] = useState(new Date().toISOString().slice(0, 10));
  const [quickNote, setQuickNote] = useState("");
  const [contributionAmount, setContributionAmount] = useState("");
  const [contributionDate, setContributionDate] = useState(
    new Date().toISOString().slice(0, 10),
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
  const [bankLauncher, setBankLauncher] = useState<BankLauncherState | null>(
    null,
  );
  const [currentMonth, setCurrentMonth] = useState(initialData.selectedMonth);
  const [loadedMonthKeys, setLoadedMonthKeys] = useState<string[]>([
    initialData.selectedMonth,
  ]);
  const [loadingMonth, setLoadingMonth] = useState<string | null>(null);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isScanningReceipt, setIsScanningReceipt] = useState(false);
  const [monthMessage, setMonthMessage] = useState("");
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(
    null,
  );
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
    () => categoryById(initialData.categories),
    [initialData.categories],
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
            second.snapshotDate.localeCompare(first.snapshotDate) ||
            second.id.localeCompare(first.id),
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
          "Alleen prive-uitgaven van de ingelogde gebruiker. Geen vaste lasten beheer.",
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
    () => categoryTotals(selectedTransactions, initialData.categories, currentMonth),
    [currentMonth, initialData.categories, selectedTransactions],
  );
  const personTotals = useMemo(
    () => totalsByPerson(selectedTransactions, currentMonth),
    [currentMonth, selectedTransactions],
  );
  const categoryPersonRows = useMemo(
    () =>
      categoryTotalsByPerson(
        selectedTransactions.filter((transaction) => transaction.type === "variable"),
        initialData.categories,
        currentMonth,
      ),
    [currentMonth, initialData.categories, selectedTransactions],
  );
  const selectedSixMonthTrend = useMemo(
    () => sixMonthTrend(selectedTransactions, currentMonth),
    [currentMonth, selectedTransactions],
  );
  const monthTransactions = useMemo(
    () =>
      selectedTransactions
        .filter((transaction) => transaction.date.startsWith(currentMonth))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [currentMonth, selectedTransactions],
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
  const incomeTransactions = monthTransactions.filter(
    (transaction) => transaction.type === "income",
  );
  const incomeTotal = incomeTransactions.reduce(
    (total, transaction) => total + transaction.amount,
    0,
  );
  const sharedContributionPlans = useMemo(
    () =>
      contributionPlans.filter(
        (plan) => plan.isActive && plan.accountId === defaultAccount?.id,
      ),
    [contributionPlans, defaultAccount?.id],
  );
  const contributionReceivedByUser = useMemo(() => {
    const totals = new Map<string, number>();

    transactions
      .filter(
        (transaction) =>
          transaction.type === "contribution" &&
          transaction.date.startsWith(currentMonth) &&
          (transaction.accountId ?? defaultAccount?.id) === defaultAccount?.id,
      )
      .forEach((transaction) => {
        const key = transaction.enteredById ?? transaction.enteredBy;
        totals.set(key, (totals.get(key) ?? 0) + transaction.amount);
      });

    return totals;
  }, [currentMonth, defaultAccount?.id, transactions]);
  const contributionPlanRows = useMemo(
    () =>
      sharedContributionPlans.map((plan) => {
        const received =
          contributionReceivedByUser.get(plan.userId) ??
          contributionReceivedByUser.get(plan.person) ??
          0;

        return {
          ...plan,
          received,
          remaining: Math.max(plan.monthlyAmount - received, 0),
        };
      }),
    [contributionReceivedByUser, sharedContributionPlans],
  );
  const plannedContributionTotal = contributionPlanRows.reduce(
    (total, plan) => total + plan.monthlyAmount,
    0,
  );
  const remainingContributionTotal = contributionPlanRows.reduce(
    (total, plan) => total + plan.remaining,
    0,
  );
  const projectedNetTotal = plannedContributionTotal - monthTotals.expenseTotal;
  const expectedIncomeTotal = isSharedView
    ? plannedContributionTotal + monthTotals.contributionTotal
    : incomeTotal;
  const expectedMonthDelta = expectedIncomeTotal - monthTotals.expenseTotal;
  const calculatedBalance = latestBalanceSnapshot
    ? latestBalanceSnapshot.balance +
      selectedTransactions
        .filter((transaction) => transaction.date > latestBalanceSnapshot.snapshotDate)
        .filter((transaction) => transaction.date < monthStart(addIsoMonths(currentMonth, 1)))
        .reduce((total, transaction) => total + signedTransactionAmount(transaction), 0)
    : null;
  const expectedMonthEndBalance =
    calculatedBalance === null ? null : calculatedBalance + expectedMonthDelta;
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
  const openFixedAgendaItems = fixedAgendaItems.filter(
    (item) =>
      item.state === "overdue" ||
      item.state === "today" ||
      item.state === "upcoming",
  );
  const openFixedTotal = openFixedAgendaItems.reduce(
    (total, item) => total + item.amount,
    0,
  );
  const dashboardPrimaryValue =
    calculatedBalance === null
      ? currency(monthTotals.netTotal)
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
          icon: <ArrowDownToLine className="h-5 w-5" />,
          label: "Nog te storten",
          value: currency(remainingContributionTotal),
          tone: remainingContributionTotal > 0 ? "indigo" : "emerald",
        },
        {
          icon: <ListChecks className="h-5 w-5" />,
          label: "Komt eraan",
          value: currency(openFixedTotal),
          tone: fixedAgendaItems.some((item) => item.state === "overdue")
            ? "red"
            : openFixedTotal > 0
              ? "indigo"
              : "emerald",
        },
        {
          icon: <ReceiptText className="h-5 w-5" />,
          label: "Uitgegeven",
          value: currency(monthTotals.expenseTotal),
          tone: "zinc" as const,
        },
        {
          icon: <WalletCards className="h-5 w-5" />,
          label: "Einde maand",
          value:
            expectedMonthEndBalance === null
              ? currency(monthTotals.netTotal)
              : currency(expectedMonthEndBalance),
          tone:
            expectedMonthEndBalance !== null && expectedMonthEndBalance < 0
              ? "red"
              : "emerald",
        },
      ]
    : [
        {
          icon: <WalletCards className="h-5 w-5" />,
          label: "Inkomen",
          value: currency(monthTotals.incomeTotal),
          tone: "emerald" as const,
        },
        {
          icon: <WalletCards className="h-5 w-5" />,
          label: "Uitgaven",
          value: currency(monthTotals.variableTotal),
          tone: "zinc" as const,
        },
        {
          icon: <ReceiptText className="h-5 w-5" />,
          label: "Einde maand",
          value:
            expectedMonthEndBalance === null
              ? currency(monthTotals.netTotal)
              : currency(expectedMonthEndBalance),
          tone:
            expectedMonthEndBalance !== null && expectedMonthEndBalance < 0
              ? "red"
              : "indigo",
        },
        {
          icon: <ListChecks className="h-5 w-5" />,
          label: "Transacties",
          value: `${monthTransactions.length}`,
          tone: "zinc" as const,
        },
      ];
  const fixedCategories = useMemo(
    () =>
      initialData.categories.filter(
        (category) => category.kind === "fixed" || category.kind === "both",
      ),
    [initialData.categories],
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

    if (!amount || amount <= 0) {
      setScanMessage("Vul een geldig bedrag in.");
      return;
    }

    if (!quickCategory) {
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
        categoryId: quickCategory,
        amount,
        date: quickDate,
        note: quickNote || null,
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
      categoryId: quickCategory,
      amount,
      date: quickDate,
      note: quickNote || undefined,
      enteredById: initialData.currentUserId,
      enteredBy: initialData.currentPerson,
    };

    setTransactions((items) => [transaction, ...items]);

    let receiptUrl: string | null = null;
    if (receiptFile) {
      setScanMessage("Afschrijving toegevoegd. Bon wordt opgeslagen...");

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
          "Afschrijving toegevoegd, maar bon opslaan lukte niet. Je kunt verder werken.",
        );
      }
    }

    setSelectedAccountId(selectedAccount.id);
    setQuickAmount("");
    setQuickNote("");
    if (!receiptFile || receiptUrl) {
      setScanMessage(
        receiptUrl ? "Afschrijving en bon opgeslagen." : "Afschrijving toegevoegd.",
      );
    }
    setReceiptDraft(null);
    setReceiptFile(null);
  }

  async function addContribution() {
    const amount = parseCurrencyInput(contributionAmount);

    if (!amount || amount <= 0 || !defaultAccount) {
      setContributionMessage("Vul een geldig bedrag in.");
      return;
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
        note: contributionNote || "Inleg gezamenlijke rekening",
        type: "contribution",
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
      return;
    }

    const contributionCategory =
      initialData.categories.find((category) => category.name === "Inleg") ??
      ({
        id: result.transaction.categoryId,
        name: "Inleg",
        kind: "variable",
        color: "#34D399",
        averageMonthly: 0,
      } satisfies DashboardData["categories"][number]);

    setTransactions((items) => [
      {
        id: result.transaction.id,
        type: "contribution",
        accountId: defaultAccount.id,
        accountName: defaultAccount.name,
        accountKind: defaultAccount.kind,
        categoryId: contributionCategory.id,
        amount,
        date: contributionDate,
        note: contributionNote || "Inleg gezamenlijke rekening",
        enteredById: initialData.currentUserId,
        enteredBy: initialData.currentPerson,
      },
      ...items,
    ]);
    setContributionAmount("");
    setContributionNote("");
    setContributionMessage("Storting toegevoegd.");
    setSelectedAccountId(defaultAccount.id);
    setQuickAccount(defaultAccount.id);
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
      }),
    });
    const result = await response.json();

    setIsSavingIncome(false);

    if (!response.ok) {
      setIncomeMessage(
        typeof result.error === "string"
          ? result.error
          : "Inkomsten opslaan lukte niet.",
      );
      return;
    }

    const incomeCategory =
      initialData.categories.find((category) =>
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
      },
      ...items,
    ]);
    setIncomeAmount("");
    setIncomeNote("");
    setIncomeMessage("Inkomsten toegevoegd.");
  }

  function updateContributionPlanDraft(
    planId: string,
    field: "amount" | "depositDay",
    value: string,
  ) {
    setContributionPlanDrafts((drafts) => ({
      ...drafts,
      [planId]: {
        amount: drafts[planId]?.amount ?? "",
        depositDay: drafts[planId]?.depositDay ?? "1",
        [field]: value,
      },
    }));
  }

  async function saveContributionPlan(plan: ContributionPlan) {
    const draft = contributionPlanDrafts[plan.id];
    const amount = parseCurrencyInput(draft?.amount ?? "");
    const depositDay = Number(draft?.depositDay);

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
          : "Maandelijkse storting opslaan lukte niet.",
      );
      return;
    }

    const updatedPlan = result.plan as ContributionPlan;
    setContributionPlans((plans) =>
      plans.map((item) => (item.id === updatedPlan.id ? updatedPlan : item)),
    );
    setContributionPlanDrafts((drafts) => ({
      ...drafts,
      [updatedPlan.id]: {
        amount: String(updatedPlan.monthlyAmount || ""),
        depositDay: String(updatedPlan.depositDay),
      },
    }));
    setContributionPlanMessage(
      `Maandelijkse storting voor ${updatedPlan.person} bewaard.`,
    );
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
        ? "Definitief verwijderen?\n\nDeze vaste-last transactie verdwijnt uit dit maandoverzicht. De vaste last zelf blijft in de agenda staan."
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

    setMonthMessage("Afschrijving verwijderd.");
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
      `${expense.name} definitief uit vaste lasten verwijderen?\n\nHistorische transacties blijven bewaard.`,
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

  function transactionsForRange(fromMonth: string, toMonth: string) {
    const [from, to] = normalizeMonthRange(fromMonth, toMonth);

    return selectedTransactions
      .filter((transaction) => monthInRange(transaction.date.slice(0, 7), from, to))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  function exportExcel(targetMonth = currentMonth) {
    const exportTransactions = transactionsForMonth(targetMonth);
    const exportTotals = totalsForMonth(selectedTransactions, targetMonth);
    const exportFixedItems = fixedAgendaItemsForMonth(targetMonth);
    const summaryRows = [
      {
        Rekening: selectedAccount?.name ?? viewCopy.label,
        Maand: monthLabel(targetMonth),
        Stortingen: exportTotals.contributionTotal,
        Inkomsten: exportTotals.incomeTotal,
        "Vaste lasten": exportTotals.fixedTotal,
        Variabel: exportTotals.variableTotal,
        "Over/tekort": exportTotals.netTotal,
        Transacties: exportTransactions.length,
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
            ? "Inkomsten"
          : transaction.type === "contribution"
            ? "Storting"
            : "Variabel",
      Categorie:
        transaction.type === "contribution"
          ? "Storting"
          : transaction.type === "income"
            ? labels.get(transaction.categoryId)?.name ?? "Inkomsten"
          : labels.get(transaction.categoryId)?.name ?? "Onbekend",
      Bedrag: transaction.amount,
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
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(summaryRows),
      "Samenvatting",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(rows),
      "Alle transacties",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(fixedRows),
      "Vaste lasten status",
    );
    XLSX.writeFile(workbook, `huishouden-${targetMonth}.xlsx`);
  }

  function exportExcelRange(fromMonth: string, toMonth: string) {
    const [from, to] = normalizeMonthRange(fromMonth, toMonth);
    const rangeMonths = monthsInRange(from, to);
    const exportTransactions = transactionsForRange(from, to);
    const summaryRows = rangeMonths.map((month) => {
      const monthTransactionsForExport = exportTransactions.filter(
        (transaction) => transaction.date.startsWith(month),
      );
      const totals = totalsForMonth(selectedTransactions, month);

      return {
        Rekening: selectedAccount?.name ?? viewCopy.label,
        Maand: monthLabel(month),
        Stortingen: totals.contributionTotal,
        Inkomsten: totals.incomeTotal,
        "Vaste lasten": totals.fixedTotal,
        Variabel: totals.variableTotal,
        "Over/tekort": totals.netTotal,
        Transacties: monthTransactionsForExport.length,
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
            ? "Inkomsten"
          : transaction.type === "contribution"
            ? "Storting"
            : "Variabel",
      Categorie:
        transaction.type === "contribution"
          ? "Storting"
          : transaction.type === "income"
            ? labels.get(transaction.categoryId)?.name ?? "Inkomsten"
          : labels.get(transaction.categoryId)?.name ?? "Onbekend",
      Bedrag: transaction.amount,
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
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(summaryRows),
      "Samenvatting",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(rows),
      "Alle transacties",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(fixedRows),
      "Vaste lasten status",
    );
    XLSX.writeFile(workbook, `huishouden-${from}-tm-${to}.xlsx`);
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
        transactions={exportTransactions}
        categories={initialData.categories}
        fixedItems={fixedItems}
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
            ? "Storting"
            : transaction.type === "income"
              ? labels.get(transaction.categoryId)?.name ?? "Inkomsten"
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
            ? "Storting"
            : transaction.type === "income"
              ? labels.get(transaction.categoryId)?.name ?? "Inkomsten"
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

          <section className="grid gap-3 sm:grid-cols-2">
            {dashboardMetrics.map((metric) => (
              <MetricCard key={metric.label} {...metric} />
            ))}
          </section>

          <BankAppsCard onOpenBank={setBankLauncher} />

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

        <section
          className={cn(
            "finance-view gap-4 lg:hidden",
            activeSection === "fixed" ? "grid" : "hidden",
          )}
        >
          <MobileSectionHeader title="Vaste lasten" subtitle={monthLabel(currentMonth)} />
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
          <FixedExpenseAgenda
            items={fixedAgendaItems}
            currentMonth={currentMonth}
            message={fixedMessage}
            highlightedId={highlightedFixedInstanceId}
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
            category={quickCategory}
            onAmountChange={setQuickAmount}
            onAccountChange={setQuickAccount}
            onDateChange={setQuickDate}
            onNoteChange={setQuickNote}
            onCategoryChange={setQuickCategory}
            isScanningReceipt={isScanningReceipt}
            scanMessage={scanMessage}
            receiptDraft={receiptDraft}
            onScanReceipt={scanReceipt}
            onDismissReceiptDraft={dismissReceiptDraft}
            categories={initialData.categories}
            accounts={initialData.accounts}
            onSubmit={addVariableExpense}
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
          <MonthTransactionsCard
            title={viewCopy.monthTitle}
            description={viewCopy.monthDescription}
            currentMonth={currentMonth}
            monthTransactions={monthTransactions}
            labels={labels}
            selectedAccountId={selectedAccountId}
            monthMessage={monthMessage}
            deletingTransactionId={deletingTransactionId}
            onDeleteTransaction={deleteTransaction}
            onExportExcel={() => setIsExportDialogOpen(true)}
            onExportPdf={() => setIsExportDialogOpen(true)}
            onDownloadReceipts={() => setIsExportDialogOpen(true)}
            onOpenReceipt={setReceiptViewer}
          />
          <ChartsPanel
            categoryRows={categoryRows}
            selectedSixMonthTrend={selectedSixMonthTrend}
            chartsReady={mobileChartsReady}
          />
        </section>

        <div className="hidden gap-4 lg:grid lg:grid-cols-[220px_minmax(0,1fr)_320px] xl:grid-cols-[232px_minmax(0,1fr)_340px] 2xl:grid-cols-[240px_minmax(0,1fr)_360px]">
          <aside className="sticky top-4 self-start">
            <AccountRail
              tabs={accountTabs}
              selectedAccountId={selectedAccountId}
              currentMonth={currentMonth}
              currentPerson={initialData.currentPerson}
              metrics={dashboardMetrics}
              activeSection={activeSection}
              onSelect={(accountId) => {
                setSelectedAccountId(accountId);
                setQuickAccount(accountId);
              }}
              onSectionChange={setActiveSection}
            />
          </aside>

          <section className="grid min-w-0 content-start gap-4">
            <section id="finance-dashboard">
              <DashboardHero
                label={viewCopy.label}
                value={dashboardPrimaryValue}
                subtext={dashboardPrimarySubtext}
                metrics={dashboardMetrics.slice(0, 3)}
              />
            </section>

            <MonthInsightsSection
              currentMonth={currentMonth}
              monthTitle={viewCopy.monthTitle}
              monthDescription={viewCopy.monthDescription}
              monthTransactions={monthTransactions}
              labels={labels}
              selectedAccountId={selectedAccountId}
              monthMessage={monthMessage}
              deletingTransactionId={deletingTransactionId}
              categoryRows={categoryRows}
              selectedSixMonthTrend={selectedSixMonthTrend}
              chartsReady={chartsReady}
              monthOptions={monthOptions}
              onMonthChange={changeCurrentMonth}
              onDeleteTransaction={deleteTransaction}
              onExportExcel={() => setIsExportDialogOpen(true)}
              onExportPdf={() => setIsExportDialogOpen(true)}
              onDownloadReceipts={() => setIsExportDialogOpen(true)}
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
                currentMonth={currentMonth}
                message={fixedMessage}
                highlightedId={highlightedFixedInstanceId}
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
          </section>

          <aside
            data-finance-context
            className="scrollbar-hidden sticky top-4 grid max-h-[calc(100dvh-2rem)] gap-4 overflow-auto"
          >
            <AccountBalanceCard
              accountName={selectedAccount?.name ?? viewCopy.label}
              snapshot={latestBalanceSnapshot}
              calculatedBalance={calculatedBalance}
              expectedMonthEndBalance={expectedMonthEndBalance}
              expectedIncomeTotal={expectedIncomeTotal}
              expenseTotal={monthTotals.expenseTotal}
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
              incomingLabel={isSharedView ? "Te storten" : "Inkomen"}
              onBalanceAmountChange={setBalanceAmount}
              onBalanceDateChange={setBalanceDate}
              onSaveBalance={saveBalanceSnapshot}
              onIncomeAmountChange={setIncomeAmount}
              onIncomeDateChange={setIncomeDate}
              onIncomeKindChange={setIncomeKind}
              onIncomeNoteChange={setIncomeNote}
              onAddIncome={addIncome}
            />

            <BankAppsCard onOpenBank={setBankLauncher} />

            <section id="finance-input" className="scroll-mt-4">
              <QuickEntryCard
                title={viewCopy.quickTitle}
                amount={quickAmount}
                account={quickAccount}
                date={quickDate}
                note={quickNote}
                category={quickCategory}
                onAmountChange={setQuickAmount}
                onAccountChange={setQuickAccount}
                onDateChange={setQuickDate}
                onNoteChange={setQuickNote}
                onCategoryChange={setQuickCategory}
                isScanningReceipt={isScanningReceipt}
                scanMessage={scanMessage}
                receiptDraft={receiptDraft}
                onScanReceipt={scanReceipt}
                onDismissReceiptDraft={dismissReceiptDraft}
                categories={initialData.categories}
                accounts={initialData.accounts}
                onSubmit={addVariableExpense}
              />
            </section>

            {isSharedView && (
              <>
                <UpcomingFixedExpensesCard
                  items={fixedAgendaItems}
                  currentMonth={currentMonth}
                />
                <ContributionCard
                  amount={contributionAmount}
                  date={contributionDate}
                  note={contributionNote}
                  person={initialData.currentPerson}
                  plans={contributionPlanRows}
                  planDrafts={contributionPlanDrafts}
                  planMessage={contributionPlanMessage}
                  savingPlanId={savingContributionPlanId}
                  plannedTotal={plannedContributionTotal}
                  receivedTotal={monthTotals.contributionTotal}
                  remainingTotal={remainingContributionTotal}
                  projectedNetTotal={projectedNetTotal}
                  message={contributionMessage}
                  isSaving={isSavingContribution}
                  onAmountChange={setContributionAmount}
                  onDateChange={setContributionDate}
                  onNoteChange={setContributionNote}
                  onPlanDraftChange={updateContributionPlanDraft}
                  onPlanSave={saveContributionPlan}
                  onSubmit={addContribution}
                />
              </>
            )}
          </aside>
        </div>
      </div>
      {receiptViewer && (
        <ReceiptViewer
          receipt={receiptViewer}
          onClose={() => setReceiptViewer(null)}
        />
      )}
      {bankLauncher && (
        <BankLauncherDialog
          bank={bankLauncher}
          onClose={() => setBankLauncher(null)}
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
  note?: string;
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
    <nav className="finance-bottom-nav fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 items-start border-t border-[var(--border)] lg:hidden">
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
            </div>
          ))}
        </div>
      </div>
    </section>
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
  currentMonth,
  currentPerson,
  metrics,
  activeSection,
  onSelect,
  onSectionChange,
}: {
  tabs: Array<{ id: string; label: string; description: string }>;
  selectedAccountId: string;
  currentMonth: string;
  currentPerson: string;
  metrics: DashboardMetric[];
  activeSection: ActiveSection;
  onSelect: (accountId: string) => void;
  onSectionChange: (section: ActiveSection) => void;
}) {
  const items = sectionNavItems();

  return (
    <Card className="flex min-h-[calc(100dvh-2rem)] flex-col overflow-hidden bg-[var(--bg-surface)]">
      <CardContent className="flex flex-1 flex-col gap-5 p-3">
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

        <div className="grid gap-2 border-t border-[var(--border)] pt-4">
          <p className="px-2 text-xs text-[var(--text-muted)]">
            {monthLabel(currentMonth)}
          </p>
          {metrics.slice(0, 3).map((metric) => (
            <RailMetric key={metric.label} {...metric} />
          ))}
        </div>

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

function ViewSummary({
  label,
  description,
  currentMonth,
}: {
  label: string;
  description: string;
  currentMonth: string;
}) {
  return (
    <section className="rounded-[16px] border border-zinc-800/70 bg-zinc-950/35 px-4 py-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-100">{label}</p>
          <p className="mt-0.5 text-xs leading-5 text-zinc-500">
            {description}
          </p>
        </div>
        <Badge className="w-fit border-zinc-800 bg-zinc-950/70 text-zinc-400">
          {monthLabel(currentMonth)}
        </Badge>
      </div>
    </section>
  );
}

function RailMetric({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "indigo" | "emerald" | "red" | "zinc";
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-3 rounded-[13px] border border-zinc-800/70 bg-zinc-950/35 p-2.5">
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-[10px]",
          tone === "indigo" && "bg-indigo-500/15 text-indigo-300",
          tone === "emerald" && "bg-emerald-500/15 text-emerald-300",
          tone === "red" && "bg-red-500/15 text-red-300",
          tone === "zinc" && "bg-zinc-900 text-zinc-300",
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-zinc-500">{label}</p>
        <p className="mt-0.5 truncate text-base font-semibold tracking-normal text-zinc-50">
          {value}
        </p>
      </div>
    </div>
  );
}

function MonthTransactionsCard({
  title,
  description,
  currentMonth,
  monthTransactions,
  labels,
  selectedAccountId,
  monthMessage,
  deletingTransactionId,
  onDeleteTransaction,
  onExportExcel,
  onExportPdf,
  onDownloadReceipts,
  onOpenReceipt,
  compact = false,
  className,
}: {
  title: string;
  description: string;
  currentMonth: string;
  monthTransactions: Transaction[];
  labels: Map<string, DashboardData["categories"][number]>;
  selectedAccountId: string;
  monthMessage: string;
  deletingTransactionId: string | null;
  onDeleteTransaction: (transaction: Transaction) => void;
  onExportExcel: () => void;
  onExportPdf: () => void;
  onDownloadReceipts: () => void;
  onOpenReceipt: (receipt: ReceiptViewerState) => void;
  compact?: boolean;
  className?: string;
}) {
  const visibleTransactions = compact
    ? monthTransactions.slice(0, 6)
    : monthTransactions;
  const hiddenCount = monthTransactions.length - visibleTransactions.length;
  const cardTitle = compact ? "Maandoverzicht" : title;
  const hasReceipts = monthTransactions.some((transaction) => transaction.receiptUrl);

  return (
    <Card
      className={cn(
        "finance-card overflow-hidden",
        compact ? "max-w-none" : "max-w-[640px]",
        className,
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div>
          <CardTitle>{cardTitle}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge className="hidden border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] sm:inline-flex">
            {monthLabel(currentMonth)}
          </Badge>
          <Button size="icon" variant="secondary" onClick={onExportExcel} title="Exporteer Excel" className="h-9 w-9">
            <FileSpreadsheet className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="secondary" onClick={onExportPdf} title="Exporteer PDF" className="h-9 w-9">
            <ArrowDownToLine className="h-4 w-4" />
          </Button>
          {hasReceipts && (
            <Button
              variant="secondary"
              onClick={onDownloadReceipts}
              title={`Download bonnen ${monthLabel(currentMonth)}`}
              className="h-9 px-3 text-xs"
            >
              <ReceiptText className="h-4 w-4" />
              <span className="hidden xl:inline">Bonnen</span>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {monthMessage && (
          <p className="mx-4 mb-3 rounded-[12px] border border-[var(--border)] bg-[var(--bg-surface)] p-3 text-sm text-[var(--text-secondary)] sm:mx-5">
            {monthMessage}
          </p>
        )}

        {monthTransactions.length > 0 ? (
          <div className="divide-y divide-[var(--border)]">
            {visibleTransactions.map((transaction) => {
              const category = labels.get(transaction.categoryId);
              const isDeleting = deletingTransactionId === transaction.id;
              const isContribution = transaction.type === "contribution";
              const isIncome = transaction.type === "income";
              const isPositive = isContribution || isIncome;
              const title =
                isContribution
                  ? "Storting"
                  : isIncome
                    ? category?.name ?? "Inkomsten"
                    : category?.name ?? "Onbekend";
              const metadata = [
                transaction.type === "fixed" ? "Vaste last" : category?.name,
                transaction.date,
                transaction.note,
              ]
                .filter(Boolean)
                .join(" · ");

              return (
                <div
                  key={transaction.id}
                  className={cn(
                    "desktop-row-hover grid grid-cols-[1fr_auto] items-center gap-3 px-4 transition sm:px-5",
                    compact ? "py-2.5" : "py-3",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--bg-surface)] text-[var(--text-secondary)]">
                      <ReceiptText className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                        {title}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                        {metadata}
                      </p>
                    </div>
                  </div>

                  <div className="flex min-w-fit items-center gap-2 text-right">
                    {transaction.receiptUrl && (
                      <ReceiptAttachment
                        receiptUrl={transaction.receiptUrl}
                        title={`${title} · ${transaction.date}`}
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
                        {preciseCurrency(transaction.amount)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                        {selectedAccountId === "all"
                          ? transaction.accountName
                          : transaction.enteredBy}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Verwijder afschrijving"
                      onClick={() => onDeleteTransaction(transaction)}
                      disabled={isDeleting}
                      className="h-8 w-8 text-[var(--text-muted)] hover:text-[var(--negative)]"
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
            {hiddenCount > 0 && (
              <div className="px-4 py-3 text-xs text-[var(--text-muted)] sm:px-5">
                Plus {hiddenCount} extra transacties in dit maandoverzicht.
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
      onClick={() => {
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
  monthTransactions,
  labels,
  selectedAccountId,
  monthMessage,
  deletingTransactionId,
  categoryRows,
  selectedSixMonthTrend,
  chartsReady,
  onMonthChange,
  onDeleteTransaction,
  onExportExcel,
  onExportPdf,
  onDownloadReceipts,
  onOpenReceipt,
}: {
  currentMonth: string;
  monthOptions: MonthOption[];
  monthTitle: string;
  monthDescription: string;
  monthTransactions: Transaction[];
  labels: Map<string, DashboardData["categories"][number]>;
  selectedAccountId: string;
  monthMessage: string;
  deletingTransactionId: string | null;
  categoryRows: ReturnType<typeof categoryTotals>;
  selectedSixMonthTrend: ReturnType<typeof sixMonthTrend>;
  chartsReady: boolean;
  onMonthChange: (month: string) => void;
  onDeleteTransaction: (transaction: Transaction) => void;
  onExportExcel: () => void;
  onExportPdf: () => void;
  onDownloadReceipts: () => void;
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
            Transacties, verdeling en trend in een overzicht.
          </p>
        </div>
        <MonthNavigator
          currentMonth={currentMonth}
          monthOptions={monthOptions}
          onMonthChange={onMonthChange}
          compact
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(340px,0.78fr)_minmax(0,1.22fr)]">
        <MonthTransactionsCard
          title={monthTitle}
          description={monthDescription}
          currentMonth={currentMonth}
          monthTransactions={monthTransactions}
          labels={labels}
          selectedAccountId={selectedAccountId}
          monthMessage={monthMessage}
          deletingTransactionId={deletingTransactionId}
          onDeleteTransaction={onDeleteTransaction}
          onExportExcel={onExportExcel}
          onExportPdf={onExportPdf}
          onDownloadReceipts={onDownloadReceipts}
          onOpenReceipt={onOpenReceipt}
          compact
          className="xl:sticky xl:top-4"
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
}: {
  categoryRows: ReturnType<typeof categoryTotals>;
  selectedSixMonthTrend: ReturnType<typeof sixMonthTrend>;
  chartsReady: boolean;
  featured?: boolean;
}) {
  const totalCategories = categoryRows.reduce((total, row) => total + row.amount, 0);
  const hasCategoryData = totalCategories > 0;
  const topCategory = categoryRows[0];
  const visibleCategoryRows = featured ? categoryRows.slice(0, 5) : categoryRows;
  const latestTrend = selectedSixMonthTrend.at(-1);
  const latestTrendTotal = latestTrend
    ? Number(latestTrend.fixed) + Number(latestTrend.variable)
    : 0;
  const hasTrendData = selectedSixMonthTrend.some(
    (row) => Number(row.fixed) + Number(row.variable) > 0,
  );

  return (
    <section className={cn("grid gap-4", !featured && "lg:grid-cols-1 2xl:grid-cols-2")}>
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
                Zodra er kosten staan, zie je hier direct welke categorieen de maand bepalen.
              </p>
            )}
            {visibleCategoryRows.filter((row) => row.amount > 0).map((row) => {
              const overBudget = row.average > 0 && row.amount > row.average;

              return (
                <div
                  key={row.categoryId}
                  className="grid grid-cols-[minmax(5rem,1fr)_minmax(80px,200px)_auto] items-center gap-3 text-xs"
                >
                  <span className="truncate text-[var(--text-secondary)]">
                    {row.name}
                  </span>
                  <Progress
                    value={row.amount}
                    max={row.average || row.amount}
                    className="max-w-[200px]"
                    indicatorClassName={
                      overBudget ? "bg-[var(--negative)]" : "bg-[var(--positive)]"
                    }
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

      <Card className="finance-card overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Laatste 6 maanden</CardTitle>
              <CardDescription>Vaste lasten en variabele kosten naast elkaar.</CardDescription>
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
                data={selectedSixMonthTrend}
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
                  formatter={(value) => currency(Number(value))}
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "rgba(99, 102, 241, 0.08)" }}
                />
                <Bar dataKey="fixed" fill="var(--accent)" radius={[8, 8, 3, 3]} />
                <Bar dataKey="variable" fill="var(--positive)" radius={[8, 8, 3, 3]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full flex-col justify-center gap-3">
              {selectedSixMonthTrend.map((row, index) => (
                <div key={`${row.month}-${index}`} className="grid grid-cols-[2.5rem_1fr] items-center gap-3">
                  <span className="text-xs text-[var(--text-muted)]">{row.month}</span>
                  <div className="h-2 rounded-full bg-[var(--bg-surface)]">
                    <div className="h-full w-8 rounded-full bg-[var(--accent-light)]" />
                  </div>
                </div>
              ))}
              <p className="text-xs text-[var(--text-secondary)]">
                De trend wordt zichtbaar zodra er transacties in meerdere maanden staan.
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
    </section>
  );
}

function FixedExpenseAgenda({
  items,
  currentMonth,
  message,
  highlightedId,
  compact = false,
}: {
  items: FixedAgendaItem[];
  currentMonth: string;
  message?: string;
  highlightedId?: string | null;
  compact?: boolean;
}) {
  const monthlyTotal = items.reduce((total, item) => total + item.amount, 0);
  const openTotal = items
    .filter(
      (item) =>
        item.state === "overdue" ||
        item.state === "today" ||
        item.state === "upcoming",
    )
    .reduce((total, item) => total + item.amount, 0);
  const processedTotal = items
    .filter((item) => item.state === "processed" || item.state === "changed")
    .reduce((total, item) => total + item.amount, 0);
  const upcomingItems = items.filter(
    (item) =>
      item.state === "overdue" ||
      item.state === "today" ||
      item.state === "upcoming",
  );
  const pastItems = items.filter(
    (item) => item.state === "processed" || item.state === "changed",
  );
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
          <AgendaTotal label="Komt eraan" value={openTotal} tone="zinc" />
          <AgendaTotal label="Afgelopen" value={processedTotal} tone="emerald" />
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
                {timelineItems.length === 1 ? "afschrijving" : "afschrijvingen"}
              </p>
            </div>

            {timelineItems.length === 0 ? (
              <div className="rounded-[16px] border border-dashed border-[var(--border)] bg-black/10 p-4 text-sm leading-6 text-[var(--text-secondary)]">
                Nog geen actieve vaste lasten. Voeg onderaan je hypotheek,
                verzekeringen of abonnementen toe; daarna verschijnen ze hier
                automatisch op afschrijfdag.
              </div>
            ) : (
              <AgendaSection items={timelineItems} highlightedId={highlightedId} />
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

function UpcomingFixedExpensesCard({
  items,
  currentMonth,
}: {
  items: FixedAgendaItem[];
  currentMonth: string;
}) {
  const upcomingItems = items
    .filter(
      (item) =>
        item.state === "overdue" ||
        item.state === "today" ||
        item.state === "upcoming",
    )
    .slice(0, 4);
  const upcomingTotal = upcomingItems.reduce((total, item) => total + item.amount, 0);

  return (
    <Card className="finance-card">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Komende afschrijvingen</CardTitle>
            <CardDescription>
              Eerstvolgende vaste lasten op de gezamenlijke rekening.
            </CardDescription>
          </div>
          <Badge className="w-fit border-indigo-400/25 bg-indigo-500/10 text-indigo-200">
            {monthLabel(currentMonth)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] p-3">
          <p className="text-[11px] font-medium uppercase text-[var(--text-muted)]">
            Nog gepland
          </p>
          <p className="mt-1 text-xl font-semibold text-[var(--text-primary)]">
            {currency(upcomingTotal)}
          </p>
        </div>

        {upcomingItems.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-[var(--border)] bg-black/10 p-4 text-sm leading-6 text-[var(--text-secondary)]">
            Geen komende afschrijvingen. Voeg vaste lasten toe bij Vaste lasten;
            daarna verschijnen ze hier automatisch.
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)] rounded-[14px] border border-[var(--border)] bg-black/10">
            {upcomingItems.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[44px_1fr_auto] items-center gap-3 px-3 py-3"
              >
                <div className="rounded-[12px] bg-[var(--accent-light)] px-2 py-1 text-center">
                  <p className="text-[10px] font-medium uppercase text-[var(--text-secondary)]">
                    {monthShort(item.date)}
                  </p>
                  <p className="text-sm font-semibold text-[var(--accent)]">
                    {item.day}
                  </p>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.categoryColor }}
                    />
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {item.name}
                    </p>
                  </div>
                  <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">
                    {item.categoryName} · {agendaStateLabel(item.state)}
                  </p>
                </div>
                <p className="text-right text-sm font-semibold text-[var(--text-primary)]">
                  {currency(item.amount)}
                </p>
              </div>
            ))}
          </div>
        )}
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
            Afschrijvingen per dag
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
          const hasProcessed = cell.items.some(
            (item) => item.state === "processed" || item.state === "changed",
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
}: {
  items: FixedAgendaItem[];
  highlightedId?: string | null;
}) {
  return (
    <div className="relative space-y-0">
      {items.map((item) => (
        <AgendaRow
          key={item.id}
          item={item}
          isHighlighted={highlightedId === item.id}
        />
      ))}
    </div>
  );
}

function AgendaRow({
  item,
  isHighlighted,
}: {
  item: FixedAgendaItem;
  isHighlighted: boolean;
}) {
  const isProcessed = item.state === "processed" || item.state === "changed";
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
          <p
            className={cn(
              "text-sm font-semibold text-[var(--text-primary)]",
              isSkipped && "text-[var(--text-muted)] line-through",
            )}
          >
            {currency(item.amount)}
          </p>
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
            Terugkerende afschrijvingen op {accountName}.
          </CardDescription>
        </div>
        {editingId && (
          <Button size="sm" variant="secondary" onClick={onCancel}>
            <X className="h-4 w-4" />
            Annuleer
          </Button>
        )}
      </CardHeader>
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
    ? "Gezamenlijke kosten per persoon"
    : "Mijn toegevoegde kosten";
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
              Nog geen variabele kosten om te verdelen.
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
                    <Progress
                      value={personRow.amount}
                      max={row.total}
                      indicatorClassName={
                        personRow.person === "Ralph"
                          ? "bg-indigo-500"
                          : "bg-emerald-500"
                      }
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
  calculatedBalance,
  expectedMonthEndBalance,
  expectedIncomeTotal,
  expenseTotal,
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
  incomingLabel,
  onBalanceAmountChange,
  onBalanceDateChange,
  onSaveBalance,
  onIncomeAmountChange,
  onIncomeDateChange,
  onIncomeKindChange,
  onIncomeNoteChange,
  onAddIncome,
}: {
  accountName: string;
  snapshot?: AccountBalanceSnapshot;
  calculatedBalance: number | null;
  expectedMonthEndBalance: number | null;
  expectedIncomeTotal: number;
  expenseTotal: number;
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
  incomingLabel: string;
  onBalanceAmountChange: (value: string) => void;
  onBalanceDateChange: (value: string) => void;
  onSaveBalance: () => void;
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
        <div className="grid grid-cols-2 gap-2">
          <ContributionStat
            label="Berekend nu"
            value={
              calculatedBalance === null ? "Nog geen saldo" : currency(calculatedBalance)
            }
            tone={calculatedBalance === null ? "zinc" : "indigo"}
          />
          <ContributionStat
            label="Eind maand"
            value={
              expectedMonthEndBalance === null
                ? "Nog geen saldo"
                : currency(expectedMonthEndBalance)
            }
            tone={
              expectedMonthEndBalance !== null && expectedMonthEndBalance < 0
                ? "red"
                : "emerald"
            }
          />
          <ContributionStat label={incomingLabel} value={currency(expectedIncomeTotal)} />
          <ContributionStat
            label="Uitgaven"
            value={currency(expenseTotal)}
            tone={expenseTotal > expectedIncomeTotal ? "red" : "zinc"}
          />
        </div>

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
              <Badge className="border-zinc-800 bg-zinc-950/70 text-zinc-400">
                {snapshot.enteredBy}
              </Badge>
            )}
          </div>
        </div>

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
              Salaris / inkomsten
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
                  <option value="salary">Salaris</option>
                  <option value="extra">Extra</option>
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

function BankAppsCard(_props: {
  onOpenBank: (bank: BankLauncherState) => void;
}) {
  return (
    <Card className="finance-card hidden lg:block">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Bankieren</CardTitle>
        <CardDescription>
          Open je bankwebsite om saldo of afschrijvingen te controleren.
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

function BankLauncherDialog({
  bank,
  onClose,
}: {
  bank: BankLauncherState;
  onClose: () => void;
}) {
  function openBankApp() {
    const isAndroid =
      typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
    const targetUrl = isAndroid ? bank.androidIntentUrl : bank.appUrl;

    window.location.href = targetUrl;
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-end bg-black/70 p-3 backdrop-blur-xl sm:place-items-center sm:p-6">
      <div className="w-full max-w-sm rounded-[24px] border border-[var(--border-strong)] bg-[var(--bg-card)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-xs font-bold tracking-normal shadow-[0_10px_28px_rgba(0,0,0,0.24)]",
                bank.badgeClass,
              )}
            >
              {bank.badge}
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-[var(--text-primary)]">
                {bank.label} openen
              </p>
              <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">
                We proberen de bankapp op je telefoon te openen.
              </p>
            </div>
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

        <div className="mt-4 grid gap-2">
          <Button
            type="button"
            onClick={openBankApp}
            className="accent-glow-hover h-12 justify-center rounded-[var(--radius-btn)] bg-[var(--accent)] text-sm font-semibold text-white hover:bg-[var(--accent)]"
          >
            <Smartphone className="h-4 w-4" />
            Open app
          </Button>
          <a
            href={bank.webUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-btn)] border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
          >
            <Globe className="h-4 w-4" />
            Open website
          </a>
        </div>

        <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">
          Als je telefoon vraagt of de app geopend mag worden, kies Open. Lukt
          dat niet, gebruik dan de websiteknop.
        </p>
      </div>
    </div>
  );
}

function ContributionCard({
  amount,
  date,
  note,
  person,
  plans,
  planDrafts,
  planMessage,
  savingPlanId,
  plannedTotal,
  receivedTotal,
  remainingTotal,
  projectedNetTotal,
  message,
  isSaving,
  onAmountChange,
  onDateChange,
  onNoteChange,
  onPlanDraftChange,
  onPlanSave,
  onSubmit,
}: {
  amount: string;
  date: string;
  note: string;
  person: string;
  plans: Array<
    ContributionPlan & {
      received: number;
      remaining: number;
    }
  >;
  planDrafts: Record<string, { amount: string; depositDay: string }>;
  planMessage: string;
  savingPlanId: string | null;
  plannedTotal: number;
  receivedTotal: number;
  remainingTotal: number;
  projectedNetTotal: number;
  message: string;
  isSaving: boolean;
  onAmountChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onPlanDraftChange: (
    planId: string,
    field: "amount" | "depositDay",
    value: string,
  ) => void;
  onPlanSave: (plan: ContributionPlan) => void;
  onSubmit: () => void;
}) {
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
              Gepland {currency(plannedTotal)}
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
          {plans.map((plan) => {
            const isComplete = plan.remaining <= 0;

            return (
              <div
                key={plan.id}
                className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {plan.person}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                    Rond dag {plan.depositDay} · {currency(plan.received)} binnen
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
          {plans.length === 0 && (
            <p className="p-3 text-sm text-[var(--text-secondary)]">
              Maandelijkse stortingen verschijnen zodra Supabase chunk 20 is uitgevoerd.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <ContributionStat
            label="Nog verwacht"
            value={currency(remainingTotal)}
            tone={remainingTotal > 0 ? "indigo" : "emerald"}
          />
          <ContributionStat
            label="Na uitgaven"
            value={currency(projectedNetTotal)}
            tone={projectedNetTotal < 0 ? "red" : "emerald"}
          />
        </div>

        {planMessage && (
          <p className="rounded-[12px] border border-[var(--border)] bg-[var(--bg-surface)] p-3 text-sm text-[var(--text-secondary)]">
            {planMessage}
          </p>
        )}

        <details className="group rounded-[14px] border border-[var(--border)] bg-black/10">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium text-[var(--text-primary)]">
            Aanpassen
            <Plus className="h-4 w-4 text-[var(--text-muted)] transition group-open:rotate-45" />
          </summary>
          <div className="grid gap-3 border-t border-[var(--border)] p-3">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-normal text-[var(--text-muted)]">
                Maandelijkse storting
              </p>
              {plans.map((plan) => {
                const draft = planDrafts[plan.id] ?? {
                  amount: String(plan.monthlyAmount || ""),
                  depositDay: String(plan.depositDay),
                };
                const isSavingPlan = savingPlanId === plan.id;

                return (
                  <div key={plan.id} className="grid gap-2 rounded-[12px] bg-[var(--bg-surface)] p-2">
                    <p className="text-xs font-medium text-[var(--text-secondary)]">
                      {plan.person}
                    </p>
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
                        aria-label={`Stortdag ${plan.person}`}
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
                        title={`Maandelijkse storting ${plan.person} bewaren`}
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
            </div>

            <div className="grid gap-2 border-t border-[var(--border)] pt-3">
              <p className="text-xs font-medium uppercase tracking-normal text-[var(--text-muted)]">
                Extra storting
              </p>
              <Input
                inputMode="decimal"
                placeholder="Bedrag"
                value={amount}
                className="h-10 text-sm font-semibold"
                onChange={(event) => onAmountChange(event.target.value)}
              />
              <Input
                type="date"
                value={date}
                className="h-10"
                onChange={(event) => onDateChange(event.target.value)}
              />
              <Input
                placeholder={`Notitie, bijv. storting ${person}`}
                value={note}
                className="h-10"
                onChange={(event) => onNoteChange(event.target.value)}
              />
              <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-xs text-[var(--text-muted)]">
                  Ingevoerd door {person}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={onSubmit}
                  disabled={isSaving}
                  className="border-emerald-400/20 text-emerald-200 hover:border-emerald-400/30 hover:bg-emerald-500/10"
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
        </details>

        {message && (
          <p className="rounded-[12px] border border-[var(--border)] bg-[var(--bg-surface)] p-3 text-sm text-[var(--text-secondary)]">
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ContributionStat({
  label,
  value,
  tone = "zinc",
}: {
  label: string;
  value: string;
  tone?: "zinc" | "indigo" | "emerald" | "red";
}) {
  return (
    <div
      className={cn(
        "rounded-[12px] border bg-black/10 p-2.5",
        tone === "zinc" && "border-[var(--border)]",
        tone === "indigo" && "border-[var(--border-strong)] bg-[var(--accent-light)]",
        tone === "emerald" && "border-emerald-400/20 bg-[var(--positive-light)]",
        tone === "red" && "border-red-400/25 bg-[var(--negative-light)]",
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
  categories,
  accounts,
  onAmountChange,
  onAccountChange,
  onDateChange,
  onNoteChange,
  onCategoryChange,
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
  categories: DashboardData["categories"];
  accounts: DashboardData["accounts"];
  onAmountChange: (value: string) => void;
  onAccountChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  isScanningReceipt: boolean;
  scanMessage: string;
  receiptDraft: ReceiptDraft | null;
  onScanReceipt: (file: File) => void;
  onDismissReceiptDraft: () => void;
  onSubmit: () => void;
}) {
  const variableCategories = categories.filter(
    (item) =>
      (item.kind === "variable" || item.kind === "both") && item.name !== "Inleg",
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
            Afschrijving toevoegen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "indigo" | "emerald" | "red" | "zinc";
}) {
  return (
    <Card className="grid grid-cols-[auto_1fr] items-center gap-3 p-3 sm:p-4">
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-[12px]",
          tone === "indigo" && "bg-indigo-500/15 text-indigo-300",
          tone === "emerald" && "bg-emerald-500/15 text-emerald-300",
          tone === "red" && "bg-red-500/15 text-red-300",
          tone === "zinc" && "bg-zinc-900 text-zinc-300",
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-zinc-500">{label}</p>
        <p className="mt-0.5 truncate text-xl font-semibold tracking-normal text-zinc-50">
          {value}
        </p>
      </div>
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
  if (date < today) return "overdue";
  if (date === today) return "today";
  return "upcoming";
}

function agendaStateLabel(state: FixedAgendaState) {
  const labels: Record<FixedAgendaState, string> = {
        processed: "afgelopen",
        changed: "aangepast",
        skipped: "overgeslagen",
        overdue: "had al moeten komen",
        today: "vandaag",
        upcoming: "komt eraan",
  };

  return labels[state];
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

function monthShort(date: string) {
  const month = Number(date.slice(5, 7));
  return [
    "jan",
    "feb",
    "mrt",
    "apr",
    "mei",
    "jun",
    "jul",
    "aug",
    "sep",
    "okt",
    "nov",
    "dec",
  ][month - 1];
}
