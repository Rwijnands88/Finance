"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  ArrowDownToLine,
  Camera,
  CalendarDays,
  FileSpreadsheet,
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
import { MonthReportDocument } from "@/components/finance/month-report-document";

type ReceiptDraft = {
  amount: number | null;
  date: string | null;
  merchant: string | null;
};

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
  const [contributionPlanMessage, setContributionPlanMessage] = useState("");
  const [savingContributionPlanId, setSavingContributionPlanId] = useState<
    string | null
  >(null);
  const [scanMessage, setScanMessage] = useState("");
  const [receiptDraft, setReceiptDraft] = useState<ReceiptDraft | null>(null);
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

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setChartsReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const currentMonth = initialData.selectedMonth;
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
  const viewCopy = isSharedView
    ? {
        label: "Gezamenlijke rekening",
        description:
          "Voor vaste lasten, boodschappen, tanken en alles wat jullie samen betalen.",
        quickTitle: "Gezamenlijke uitgave",
        monthTitle: "Gezamenlijk maandoverzicht",
        monthDescription: `${selectedAccount?.name ?? "Gezamenlijke rekening"} in ${monthLabel(initialData.selectedMonth)}.`,
      }
    : {
        label: "Mijn rekening",
        description:
          "Alleen prive-uitgaven van de ingelogde gebruiker. Geen vaste lasten beheer.",
        quickTitle: "Prive-uitgave",
        monthTitle: "Prive maandoverzicht",
        monthDescription: `${selectedAccount?.name ?? "Mijn rekening"} in ${monthLabel(initialData.selectedMonth)}.`,
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
  const topCategory = categoryRows[0];
  const fixedAgendaItems = useMemo(
    () =>
      buildFixedAgendaItems(
        recurringExpenses,
        fixedInstances,
        currentMonth,
        labels,
      ),
    [currentMonth, fixedInstances, labels, recurringExpenses],
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
  const fixedCategories = useMemo(
    () =>
      initialData.categories.filter(
        (category) => category.kind === "fixed" || category.kind === "both",
      ),
    [initialData.categories],
  );

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
    setSelectedAccountId(selectedAccount.id);
    setQuickAmount("");
    setQuickNote("");
    setScanMessage("Afschrijving toegevoegd.");
    setReceiptDraft(null);
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
          : "Inleg opslaan lukte niet. Probeer het nog eens.",
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
    setContributionMessage("Inleg toegevoegd.");
    setSelectedAccountId(defaultAccount.id);
    setQuickAccount(defaultAccount.id);
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
          : "Standaardinleg opslaan lukte niet.",
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
    setContributionPlanMessage(`Standaardinleg voor ${updatedPlan.person} bewaard.`);
  }

  async function scanReceipt(file: File) {
    setIsScanningReceipt(true);
    setScanMessage("Bon wordt gelezen...");
    setReceiptDraft(null);

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

  function exportExcel() {
    const rows = monthTransactions.map((transaction) => ({
      Datum: transaction.date,
      Rekening: transaction.accountName ?? "",
      Type:
        transaction.type === "fixed"
          ? "Vaste last"
          : transaction.type === "contribution"
            ? "Inleg"
            : "Variabel",
      Categorie:
        transaction.type === "contribution"
          ? "Inleg"
          : labels.get(transaction.categoryId)?.name ?? "Onbekend",
      Bedrag: transaction.amount,
      IngevoerdDoor: transaction.type === "fixed" ? "" : transaction.enteredBy,
      Notitie: transaction.note ?? "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transacties");
    XLSX.writeFile(workbook, `huishouden-${currentMonth}.xlsx`);
  }

  async function exportPdf() {
    const { pdf } = await import("@react-pdf/renderer");
    const blob = await pdf(
      <MonthReportDocument
        month={currentMonth}
        transactions={transactions}
        categories={initialData.categories}
      />,
    ).toBlob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `maandrapport-${currentMonth}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-dvh bg-[#09090B] text-zinc-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 border-b border-zinc-900 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-normal text-zinc-50 sm:text-3xl">
              Finance
            </h1>
            <p className="mt-1 text-sm text-zinc-500">Familie Wijnands</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge className="border-zinc-800 bg-zinc-950/70 text-zinc-300">
              {initialData.currentPerson}
            </Badge>
            <form action="/auth/sign-out" method="post">
              <Button type="submit" size="sm" variant="ghost">
                <LogOut className="h-4 w-4" />
                Uitloggen
              </Button>
            </form>
          </div>
        </header>

        <section className="order-1 lg:order-none">
          <div className="inline-grid w-full gap-1 rounded-[14px] border border-zinc-800 bg-zinc-950/55 p-1 sm:w-auto sm:grid-flow-col">
            {accountTabs.map((tab) => {
              const isActive = selectedAccountId === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setSelectedAccountId(tab.id);
                    setQuickAccount(tab.id);
                  }}
                  className={cn(
                    "rounded-[10px] border px-3 py-2 text-left transition sm:min-w-44",
                    isActive
                      ? "border-zinc-700 bg-zinc-900 text-zinc-50"
                      : "border-transparent text-zinc-500 hover:bg-zinc-900/60 hover:text-zinc-200",
                  )}
                >
                  <span className="block text-sm font-semibold">{tab.label}</span>
                  <span className="mt-0.5 block truncate text-xs text-zinc-600">
                    {tab.description}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="order-1 rounded-[16px] border border-zinc-800/70 bg-zinc-950/35 px-4 py-3 lg:order-none">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-zinc-100">
                {viewCopy.label}
              </p>
              <p className="mt-0.5 text-xs leading-5 text-zinc-500">
                {viewCopy.description}
              </p>
            </div>
            <Badge className="w-fit border-zinc-800 bg-zinc-950/70 text-zinc-400">
              {monthLabel(currentMonth)}
            </Badge>
          </div>
        </section>

        <section className="order-2 grid gap-3 lg:order-none lg:grid-cols-4">
          {isSharedView ? (
            <MetricCard
              icon={<ArrowDownToLine className="h-5 w-5" />}
              label="Inleg"
              value={currency(monthTotals.contributionTotal)}
              tone="emerald"
            />
          ) : (
            <MetricCard
              icon={<WalletCards className="h-5 w-5" />}
              label="Prive totaal"
              value={currency(monthTotals.total)}
              tone="indigo"
            />
          )}
          <MetricCard
            icon={<WalletCards className="h-5 w-5" />}
            label={isSharedView ? "Uitgaven" : "Variabel prive"}
            value={currency(isSharedView ? monthTotals.expenseTotal : monthTotals.variableTotal)}
            tone={isSharedView ? "zinc" : "emerald"}
          />
          <MetricCard
            icon={<ReceiptText className="h-5 w-5" />}
            label={isSharedView ? "Over / tekort" : "Transacties"}
            value={
              isSharedView
                ? currency(monthTotals.netTotal)
                : `${monthTransactions.length}`
            }
            tone={isSharedView && monthTotals.netTotal < 0 ? "red" : "zinc"}
          />
          {isSharedView ? (
            <MetricCard
              icon={<ListChecks className="h-5 w-5" />}
              label="Open vast"
              value={currency(openFixedTotal)}
              tone={
                fixedAgendaItems.some((item) => item.state === "overdue")
                  ? "red"
                  : openFixedTotal > 0
                    ? "indigo"
                    : "emerald"
              }
            />
          ) : (
            <MetricCard
              icon={<ListChecks className="h-5 w-5" />}
              label="Grootste categorie"
              value={topCategory ? topCategory.name : "-"}
              tone="zinc"
            />
          )}
        </section>

        <section className="order-1 grid gap-4 lg:order-none lg:grid-cols-[0.78fr_1.22fr]">
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

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>{viewCopy.monthTitle}</CardTitle>
                <CardDescription>{viewCopy.monthDescription}</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button size="icon" variant="secondary" onClick={exportExcel} title="Exporteer Excel">
                  <FileSpreadsheet className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="secondary" onClick={exportPdf} title="Exporteer PDF">
                  <ArrowDownToLine className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="max-h-[520px] space-y-2 overflow-auto">
              {monthMessage && (
                <p className="rounded-[12px] border border-zinc-800 bg-zinc-950/70 p-3 text-sm text-zinc-300">
                  {monthMessage}
                </p>
              )}
              {monthTransactions.map((transaction) => {
                const category = labels.get(transaction.categoryId);
                const isDeleting = deletingTransactionId === transaction.id;
                const isContribution = transaction.type === "contribution";
                  const transactionMetadata = [
                    transaction.date,
                    transaction.type === "fixed" ? null : transaction.enteredBy,
                    transaction.note,
                  ]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <div
                    key={transaction.id}
                    className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-[12px] border border-zinc-800/70 bg-zinc-950/35 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor: isContribution
                              ? "#34D399"
                              : category?.color,
                          }}
                        />
                        <p className="truncate text-sm font-medium text-zinc-100">
                          {isContribution ? "Inleg" : category?.name}
                        </p>
                        {transaction.type !== "variable" && (
                          <Badge
                            className={cn(
                              "h-6",
                              transaction.type === "fixed" &&
                                "border-indigo-400/20 bg-indigo-500/10 text-indigo-200",
                              isContribution &&
                                "border-emerald-400/20 bg-emerald-500/10 text-emerald-200",
                            )}
                          >
                            {isContribution ? "inleg" : "vast"}
                          </Badge>
                        )}
                        {transaction.accountName && selectedAccountId === "all" && (
                          <Badge className="h-6 border-zinc-700 bg-zinc-900 text-zinc-300">
                            {transaction.accountName}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-zinc-500">
                        {transactionMetadata}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-zinc-50">
                        {isContribution ? "+" : ""}
                        {preciseCurrency(transaction.amount)}
                      </p>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Verwijder afschrijving"
                        onClick={() => deleteTransaction(transaction)}
                        disabled={isDeleting}
                        className="h-9 w-9 text-zinc-500 hover:text-red-300"
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
              {monthTransactions.length === 0 && (
                <div className="rounded-[14px] border border-dashed border-zinc-800 bg-zinc-950/45 p-4 text-sm text-zinc-400">
                  Geen afschrijvingen voor deze rekening in{" "}
                  {monthLabel(currentMonth)}.
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="order-4 grid gap-4 lg:order-none lg:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Categorieen</CardTitle>
              <CardDescription>Verdeling van deze maand.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
              <div className="h-48">
                {chartsReady && (
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                    minWidth={1}
                    minHeight={1}
                  >
                    <PieChart>
                      <Pie
                        data={categoryRows}
                        dataKey="amount"
                        nameKey="name"
                        innerRadius={58}
                        outerRadius={88}
                        paddingAngle={3}
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
              </div>
              <div className="space-y-3">
                {categoryRows.length === 0 && (
                  <p className="rounded-[14px] border border-dashed border-zinc-800 bg-zinc-950/45 p-4 text-sm text-zinc-400">
                    Nog geen categorieen voor deze rekening.
                  </p>
                )}
                {categoryRows.map((row) => {
                  const overBudget = row.average > 0 && row.amount > row.average;

                  return (
                    <div key={row.categoryId}>
                      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                        <span className="text-zinc-300">{row.name}</span>
                        <span
                          className={cn(
                            "font-medium",
                            overBudget ? "text-red-400" : "text-emerald-400",
                          )}
                        >
                          {currency(row.amount)} / {currency(row.average)}
                        </span>
                      </div>
                      <Progress
                        value={row.amount}
                        max={row.average || row.amount}
                        indicatorClassName={
                          overBudget ? "bg-red-500" : "bg-emerald-500"
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Laatste 6 maanden</CardTitle>
              <CardDescription>Vast versus variabel.</CardDescription>
            </CardHeader>
            <CardContent className="h-56">
              {chartsReady && (
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={1}
                  minHeight={1}
                >
                  <BarChart data={selectedSixMonthTrend} barGap={8}>
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#A1A1AA", fontSize: 12 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#71717A", fontSize: 12 }}
                      tickFormatter={(value) => `${Number(value) / 1000}k`}
                    />
                    <Tooltip
                      formatter={(value) => currency(Number(value))}
                      contentStyle={tooltipStyle}
                      cursor={{ fill: "rgba(99, 102, 241, 0.08)" }}
                    />
                    <Bar dataKey="fixed" fill="#6366F1" radius={[8, 8, 3, 3]} />
                    <Bar dataKey="variable" fill="#10B981" radius={[8, 8, 3, 3]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </section>

        {isSharedView && (
          <section className="order-3 grid gap-4 lg:order-none lg:grid-cols-[1fr_1fr]">
            <PersonCostInsight
              people={initialData.people}
              personTotals={personTotals}
              categoryRows={categoryPersonRows}
              isSharedView={isSharedView}
            />
            <FixedExpenseAgenda
              items={fixedAgendaItems}
              currentMonth={currentMonth}
              message={fixedMessage}
              highlightedId={highlightedFixedInstanceId}
            />
          </section>
        )}

        {isSharedView && (
          <section className="order-5 grid gap-4 lg:order-none lg:grid-cols-[0.72fr_1.28fr]">
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
            <FixedExpenseManager
              expenses={recurringExpenses}
              categories={fixedCategories}
              labels={labels}
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
        )}
      </div>
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

function FixedExpenseAgenda({
  items,
  currentMonth,
  message,
  highlightedId,
}: {
  items: FixedAgendaItem[];
  currentMonth: string;
  message?: string;
  highlightedId?: string | null;
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

  return (
    <Card>
      <CardHeader className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <CardTitle>Vaste lasten agenda</CardTitle>
          <CardDescription>
            Een maandbeeld van wat automatisch afgeschreven wordt.
          </CardDescription>
        </div>
        <Badge className="w-fit border-indigo-400/25 bg-indigo-500/10 text-indigo-200">
          {monthLabel(currentMonth)}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        {message && (
          <p className="rounded-[12px] border border-zinc-800 bg-zinc-950/70 p-3 text-sm text-zinc-300">
            {message}
          </p>
        )}

        <div className="grid grid-cols-3 gap-2">
          <AgendaTotal label="Deze maand" value={monthlyTotal} tone="indigo" />
          <AgendaTotal label="Open" value={openTotal} tone="zinc" />
          <AgendaTotal label="Verwerkt" value={processedTotal} tone="emerald" />
        </div>

        <div className="rounded-[18px] border border-zinc-800 bg-zinc-950/35 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
              <CalendarDays className="h-4 w-4 text-indigo-300" />
              Planning deze maand
            </div>
            <p className="text-xs text-zinc-500">
              {items.length} {items.length === 1 ? "afschrijving" : "afschrijvingen"}
            </p>
          </div>

          {items.length === 0 ? (
            <div className="rounded-[16px] border border-dashed border-zinc-800 bg-zinc-950/45 p-4 text-sm leading-6 text-zinc-400">
              Nog geen actieve vaste lasten. Voeg onderaan je hypotheek,
              verzekeringen of abonnementen toe; daarna verschijnen ze hier
              automatisch op afschrijfdag.
            </div>
          ) : (
            <div className="space-y-4">
              {upcomingItems.length > 0 && (
                <AgendaSection
                  title="Komt eraan"
                  items={upcomingItems}
                  highlightedId={highlightedId}
                />
              )}
              {pastItems.length > 0 && (
                <AgendaSection
                  title="Verwerkt"
                  items={pastItems}
                  highlightedId={highlightedId}
                />
              )}
              {skippedItems.length > 0 && (
                <AgendaSection
                  title="Overgeslagen"
                  items={skippedItems}
                  highlightedId={highlightedId}
                />
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
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
        tone === "indigo" && "border-indigo-400/20 bg-indigo-500/10",
        tone === "emerald" && "border-emerald-400/20 bg-emerald-500/10",
        tone === "zinc" && "border-zinc-800 bg-zinc-950/55",
      )}
    >
      <p className="text-[11px] font-medium uppercase text-zinc-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-zinc-50 sm:text-base">
        {currency(value)}
      </p>
    </div>
  );
}

function AgendaSection({
  title,
  items,
  highlightedId,
}: {
  title: string;
  items: FixedAgendaItem[];
  highlightedId?: string | null;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-zinc-500">{title}</p>
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
  return (
    <div
      className={cn(
        "grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[13px] border border-zinc-800 bg-zinc-950/40 p-3 transition",
        isHighlighted &&
          "border-indigo-400/35 bg-indigo-500/10",
      )}
    >
      <div className="flex h-11 w-11 flex-col items-center justify-center rounded-[12px] bg-zinc-900 text-zinc-100">
        <span className="text-[10px] uppercase text-zinc-500">
          {monthShort(item.date)}
        </span>
        <span className="text-base font-semibold">{item.day}</span>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: item.categoryColor }}
          />
          <p className="truncate text-sm font-medium text-zinc-100">
            {item.name}
          </p>
        </div>
        <p className="mt-1 truncate text-xs text-zinc-500">
          {item.categoryName} · {agendaStateLabel(item.state)}
          {item.note ? ` · ${item.note}` : ""}
        </p>
      </div>
      <p className="text-sm font-semibold text-zinc-50">{currency(item.amount)}</p>
    </div>
  );
}

function FixedExpenseManager({
  expenses,
  categories,
  labels,
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
            Terugkerende afschrijvingen op de gezamenlijke rekening.
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
                Nog geen vaste lasten toegevoegd. Gebruik Nieuwe vaste last
                hieronder voor de eerste terugkerende afschrijving.
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

        <details
          className="group rounded-[16px] border border-zinc-800 bg-zinc-950/30"
          open={Boolean(editingId) || activeExpenses.length === 0}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-zinc-100">
            {formTitle}
            <Plus className="h-4 w-4 text-zinc-500 transition group-open:rotate-45" />
          </summary>
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
        </details>
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-4">
          {people.map((person) => {
            const value = personTotals[person] ?? 0;

            return (
              <div key={person}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-zinc-300">{person}</span>
                  <span className="font-medium text-zinc-50">
                    {currency(value)}
                  </span>
                </div>
                <Progress
                  value={value}
                  max={maxPersonTotal}
                  indicatorClassName={
                    person === "Ralph" ? "bg-indigo-500" : "bg-emerald-500"
                  }
                />
              </div>
            );
          })}
        </div>

        <div className="space-y-3 border-t border-zinc-900 pt-4">
          {categoryRows.length === 0 && (
            <p className="rounded-[14px] border border-dashed border-zinc-800 bg-zinc-950/45 p-4 text-sm text-zinc-400">
              Nog geen variabele kosten om te verdelen.
            </p>
          )}

          {categoryRows.slice(0, 5).map((row) => (
            <div
              key={row.categoryId}
              className="rounded-[12px] border border-zinc-800/70 bg-zinc-950/35 p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
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
              <div className="space-y-2">
                {row.people.map((personRow) => (
                  <div key={personRow.person}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-zinc-500">{personRow.person}</span>
                      <span className="text-zinc-300">
                        {currency(personRow.amount)}
                      </span>
                    </div>
                    <Progress
                      value={personRow.amount}
                      max={row.total}
                      indicatorClassName={
                        personRow.person === "Ralph"
                          ? "bg-indigo-500"
                          : "bg-emerald-500"
                      }
                    />
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
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Inleg & cashflow</CardTitle>
        <CardDescription>
          Standaard maandinleg en losse bijschrijvingen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <ContributionStat label="Gepland" value={currency(plannedTotal)} />
          <ContributionStat label="Ontvangen" value={currency(receivedTotal)} />
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

        <div className="space-y-2 rounded-[14px] border border-zinc-800/70 bg-zinc-950/35 p-2">
          {plans.map((plan) => {
            const draft = planDrafts[plan.id] ?? {
              amount: String(plan.monthlyAmount || ""),
              depositDay: String(plan.depositDay),
            };
            const isSavingPlan = savingPlanId === plan.id;

            return (
              <div
                key={plan.id}
                className="grid gap-2 rounded-[12px] border border-zinc-800/70 bg-[#18181B] p-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{plan.person}</p>
                    <p className="text-xs text-zinc-500">
                      Elke maand rond dag {plan.depositDay} · binnen{" "}
                      {currency(plan.received)} · nog {currency(plan.remaining)}
                    </p>
                  </div>
                  <Badge
                    className={cn(
                      "border-zinc-700 bg-zinc-900 text-zinc-300",
                      plan.remaining <= 0 &&
                        "border-emerald-400/20 bg-emerald-500/10 text-emerald-200",
                    )}
                  >
                    dag {plan.depositDay}
                  </Badge>
                </div>
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
                    title={`Standaardinleg ${plan.person} bewaren`}
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
          {plans.length === 0 && (
            <p className="rounded-[12px] border border-dashed border-zinc-800 p-3 text-sm text-zinc-500">
              Standaardinleg verschijnt zodra Supabase chunk 20 is uitgevoerd.
            </p>
          )}
        </div>

        {planMessage && (
          <p className="rounded-[12px] border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-300">
            {planMessage}
          </p>
        )}

        <div className="grid gap-2 border-t border-zinc-800/70 pt-3">
          <p className="text-xs font-medium uppercase tracking-normal text-zinc-500">
            Losse inleg
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
            placeholder={`Notitie, bijv. inleg ${person}`}
            value={note}
            className="h-10"
            onChange={(event) => onNoteChange(event.target.value)}
          />
        </div>
        {message && (
          <p className="rounded-[12px] border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-300">
            {message}
          </p>
        )}
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-zinc-500">Ingevoerd door {person}</p>
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
        "rounded-[12px] border bg-zinc-950/40 p-2.5",
        tone === "zinc" && "border-zinc-800",
        tone === "indigo" && "border-indigo-400/25 bg-indigo-500/10",
        tone === "emerald" && "border-emerald-400/20 bg-emerald-500/10",
        tone === "red" && "border-red-400/25 bg-red-500/10",
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-normal text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-zinc-50">{value}</p>
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
    <Card className="overflow-hidden">
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

        <div className="grid grid-cols-3 gap-2">
          {variableCategories.map((item) => (
            <button
              type="button"
              key={item.id}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-[13px] border border-zinc-800 bg-zinc-950/45 p-2 text-xs font-medium text-zinc-400 transition sm:min-h-14",
                category === item.id &&
                  "border-indigo-400/70 bg-indigo-500/15 text-zinc-50",
              )}
              onClick={() => onCategoryChange(item.id)}
            >
              <ReceiptText className="h-5 w-5" />
              {item.name}
            </button>
          ))}
        </div>

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

        <Input
          inputMode="decimal"
          placeholder="Bedrag"
          value={amount}
          className="h-11 text-base font-semibold"
          onChange={(event) => onAmountChange(event.target.value)}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            type="date"
            value={date}
            className="h-10"
            onChange={(event) => onDateChange(event.target.value)}
          />
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
        </div>

        <Textarea
          placeholder="Notitie optioneel"
          value={note}
          className="min-h-16"
          onChange={(event) => onNoteChange(event.target.value)}
        />

        <div className="sticky bottom-3 z-10 pt-2">
          <Button className="h-12 w-full text-sm sm:h-11" onClick={onSubmit}>
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
  background: "#18181B",
  border: "1px solid #27272A",
  borderRadius: 12,
  color: "#FAFAFA",
};

function parseCurrencyInput(value: string) {
  return Number(value.trim().replace(/\s/g, "").replace(",", "."));
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
    processed: "verwerkt",
    changed: "aangepast",
    skipped: "overgeslagen",
    overdue: "verwacht geweest",
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
