"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  ArrowDownToLine,
  Camera,
  Car,
  Check,
  CircleUserRound,
  FileSpreadsheet,
  Fuel,
  Landmark,
  ListChecks,
  LoaderCircle,
  Plus,
  ReceiptText,
  Smartphone,
  WalletCards,
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
  type DashboardData,
  type FixedExpenseInstance,
  type Person,
  type Transaction,
} from "@/lib/types";
import {
  categoryById,
  categoryTotals,
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

export function FinanceDashboard({ initialData }: { initialData: DashboardData }) {
  const [transactions, setTransactions] =
    useState<Transaction[]>(initialData.transactions);
  const [fixedInstances, setFixedInstances] = useState<FixedExpenseInstance[]>(
    initialData.fixedInstances,
  );
  const [selectedPerson, setSelectedPerson] = useState<Person>(
    initialData.currentPerson,
  );
  const [quickCategory, setQuickCategory] = useState(
    initialData.categories.find((category) => category.kind === "variable")?.id ??
      initialData.categories[0]?.id ??
      "",
  );
  const [quickAmount, setQuickAmount] = useState("");
  const [quickDate, setQuickDate] = useState(new Date().toISOString().slice(0, 10));
  const [quickNote, setQuickNote] = useState("");
  const [fuelLiters, setFuelLiters] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [isScanningReceipt, setIsScanningReceipt] = useState(false);
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
  const monthTotals = useMemo(
    () => totalsForMonth(transactions, currentMonth),
    [currentMonth, transactions],
  );
  const categoryRows = useMemo(
    () => categoryTotals(transactions, initialData.categories, currentMonth),
    [currentMonth, initialData.categories, transactions],
  );
  const personTotals = useMemo(
    () => totalsByPerson(transactions, currentMonth),
    [currentMonth, transactions],
  );
  const monthTransactions = useMemo(
    () =>
      transactions
        .filter((transaction) => transaction.date.startsWith(currentMonth))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [currentMonth, transactions],
  );
  const pendingFixed = fixedInstances.filter(
    (expense) => expense.month === currentMonth && expense.status === "pending",
  );

  async function addVariableExpense() {
    const amount = Number(quickAmount);
    const liters = Number(fuelLiters);
    const isFuel = labels.get(quickCategory)?.name === "Tanken";

    if (!amount || amount <= 0) return;
    if (isFuel && (!liters || liters <= 0)) return;

    const response = await fetch("/api/transactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        householdId: initialData.householdId,
        categoryId: quickCategory,
        amount,
        date: quickDate,
        note: quickNote || null,
        fuel:
          isFuel && initialData.vehicles[0]
            ? {
                vehicleId: initialData.vehicles[0].id,
                vehicleName: initialData.vehicles[0].name,
                liters,
              }
            : null,
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
      categoryId: quickCategory,
      amount,
      date: quickDate,
      note: quickNote || undefined,
      enteredBy: selectedPerson,
      fuel:
        isFuel && initialData.vehicles[0]
          ? { vehicle: initialData.vehicles[0].name, liters }
          : undefined,
    };

    setTransactions((items) => [transaction, ...items]);
    setQuickAmount("");
    setQuickNote("");
    setFuelLiters("");
    setScanMessage("");
  }

  async function scanReceipt(file: File) {
    setIsScanningReceipt(true);
    setScanMessage("Bon wordt gelezen...");

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

      if (typeof result.amount === "number") {
        setQuickAmount(String(result.amount.toFixed(2)));
      }

      if (typeof result.date === "string") {
        setQuickDate(result.date);
      }

      if (typeof result.merchant === "string" && result.merchant.trim()) {
        setQuickNote(result.merchant.trim());
      }

      setScanMessage("Bon gelezen. Controleer de gegevens en sla op.");
    } catch {
      setScanMessage(
        "Deze bon kon niet gelezen worden. Je kunt handmatig verder.",
      );
    } finally {
      setIsScanningReceipt(false);
    }
  }

  async function confirmFixedExpense(expense: FixedExpenseInstance) {
    const response = await fetch("/api/fixed-expenses/confirm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ instanceId: expense.id }),
    });
    const result = await response.json();

    if (!response.ok) {
      setScanMessage(
        typeof result.error === "string"
          ? result.error
          : "Bevestigen lukte niet. Probeer het nog eens.",
      );
      return;
    }

    setFixedInstances((items) =>
      items.map((item) =>
        item.id === expense.id
          ? { ...item, status: "confirmed", confirmedBy: selectedPerson }
          : item,
      ),
    );

    setTransactions((items) => [
      {
        id: result.transactionId,
        type: "fixed",
        fixedInstanceId: expense.id,
        categoryId: expense.categoryId,
        amount: expense.amount,
        date: `${expense.month}-01`,
        enteredBy: selectedPerson,
        note: "Automatisch terugkerend",
      },
      ...items,
    ]);
  }

  function exportExcel() {
    const rows = monthTransactions.map((transaction) => ({
      Datum: transaction.date,
      Type: transaction.type === "fixed" ? "Vaste last" : "Variabel",
      Categorie: labels.get(transaction.categoryId)?.name ?? "Onbekend",
      Bedrag: transaction.amount,
      IngevoerdDoor: transaction.enteredBy,
      Notitie: transaction.note ?? "",
      Liters: transaction.fuel?.liters ?? "",
      Auto: transaction.fuel?.vehicle ?? "",
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
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-zinc-900 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Badge className="border-indigo-400/25 bg-indigo-500/10 text-indigo-200">
                PWA dashboard
              </Badge>
              <Badge>{initialData.people.join(" & ") || "Huishouden"}</Badge>
            </div>
            <h1 className="max-w-2xl text-3xl font-semibold tracking-normal text-zinc-50 sm:text-5xl">
              Finance
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400 sm:text-base">
              Familie Wijnands
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-[16px] border border-zinc-800 bg-zinc-950/60 p-2">
            {initialData.people.map((person) => (
              <button
                key={person}
                className={cn(
                  "flex h-11 items-center justify-center gap-2 rounded-[11px] px-4 text-sm font-medium text-zinc-400 transition",
                  selectedPerson === person &&
                    "bg-zinc-100 text-zinc-950 shadow-sm",
                )}
                onClick={() => setSelectedPerson(person)}
              >
                <CircleUserRound className="h-4 w-4" />
                {person}
              </button>
            ))}
          </div>
        </header>

        <section className="order-2 grid gap-4 lg:order-none lg:grid-cols-4">
          <MetricCard
            icon={<Landmark className="h-5 w-5" />}
            label="Vaste lasten"
            value={currency(monthTotals.fixedTotal)}
            tone="indigo"
          />
          <MetricCard
            icon={<WalletCards className="h-5 w-5" />}
            label="Variabel"
            value={currency(monthTotals.variableTotal)}
            tone="emerald"
          />
          <MetricCard
            icon={<ReceiptText className="h-5 w-5" />}
            label={monthLabel(currentMonth)}
            value={currency(monthTotals.total)}
            tone="zinc"
          />
          <MetricCard
            icon={<ListChecks className="h-5 w-5" />}
            label="Nog te bevestigen"
            value={`${pendingFixed.length}`}
            tone={pendingFixed.length ? "red" : "emerald"}
          />
        </section>

        <section className="order-1 grid gap-4 lg:order-none lg:grid-cols-[0.9fr_1.1fr]">
          <QuickEntryCard
            amount={quickAmount}
            date={quickDate}
            note={quickNote}
            category={quickCategory}
            fuelLiters={fuelLiters}
            onAmountChange={setQuickAmount}
            onDateChange={setQuickDate}
            onNoteChange={setQuickNote}
            onCategoryChange={setQuickCategory}
            onFuelLitersChange={setFuelLiters}
            isScanningReceipt={isScanningReceipt}
            scanMessage={scanMessage}
            onScanReceipt={scanReceipt}
            categories={initialData.categories}
            vehicles={initialData.vehicles}
            onSubmit={addVariableExpense}
          />

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Maandoverzicht</CardTitle>
                <CardDescription>
                  Alle afschrijvingen van {monthLabel(currentMonth)}.
                </CardDescription>
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
            <CardContent className="space-y-2">
              {monthTransactions.map((transaction) => {
                const category = labels.get(transaction.categoryId);

                return (
                  <div
                    key={transaction.id}
                    className="grid grid-cols-[1fr_auto] gap-3 rounded-[14px] border border-zinc-800/80 bg-zinc-950/45 p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: category?.color }}
                        />
                        <p className="truncate text-sm font-medium text-zinc-100">
                          {category?.name}
                        </p>
                        {transaction.type === "fixed" && (
                          <Badge className="h-6 border-indigo-400/20 bg-indigo-500/10 text-indigo-200">
                            vast
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-zinc-500">
                        {transaction.date} · {transaction.enteredBy}
                        {transaction.fuel
                          ? ` · ${transaction.fuel.liters} liter · ${transaction.fuel.vehicle}`
                          : ""}
                        {transaction.note ? ` · ${transaction.note}` : ""}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-zinc-50">
                      {preciseCurrency(transaction.amount)}
                    </p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>

        <section className="order-3 grid gap-4 lg:order-none lg:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Categorieen</CardTitle>
              <CardDescription>Verdeling van deze maand.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-[0.9fr_1fr]">
              <div className="h-64">
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
            <CardContent className="h-80">
              {chartsReady && (
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={1}
                  minHeight={1}
                >
                  <BarChart data={initialData.sixMonthTrend} barGap={8}>
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

        <section className="order-4 grid gap-4 lg:order-none lg:grid-cols-[1.05fr_0.95fr]">
          <Card>
            <CardHeader>
              <CardTitle>Terugkerende afschrijvingen</CardTitle>
              <CardDescription>
                Bevestig wat deze maand echt is afgeschreven.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {fixedInstances
                .filter((expense) => expense.month === currentMonth)
                .map((expense) => {
                  const category = labels.get(expense.categoryId);
                  const confirmed = expense.status !== "pending";

                  return (
                    <div
                      key={expense.id}
                      className="rounded-[16px] border border-zinc-800 bg-zinc-950/45 p-4"
                    >
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-zinc-100">
                            {expense.name}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {category?.name}
                          </p>
                        </div>
                        <Badge
                          className={cn(
                            confirmed &&
                              "border-emerald-400/20 bg-emerald-500/10 text-emerald-300",
                            !confirmed &&
                              "border-zinc-700 bg-zinc-900 text-zinc-300",
                          )}
                        >
                          {confirmed ? "bevestigd" : "open"}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xl font-semibold text-zinc-50">
                          {currency(expense.amount)}
                        </p>
                        <Button
                          size="sm"
                          variant={confirmed ? "secondary" : "primary"}
                          onClick={() => confirmFixedExpense(expense)}
                          disabled={confirmed}
                        >
                          <Check className="h-4 w-4" />
                          OK
                        </Button>
                      </div>
                    </div>
                  );
                })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Wie voerde wat in?</CardTitle>
              <CardDescription>Gedeeld huishouden, gedeeld zicht.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {initialData.people.map((person) => {
                const value = personTotals[person] ?? 0;
                const max = Math.max(
                  ...initialData.people.map((name) => personTotals[name] ?? 0),
                  1,
                );

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
                      max={max}
                      indicatorClassName={
                        person === "Ralph" ? "bg-indigo-500" : "bg-emerald-500"
                      }
                    />
                  </div>
                );
              })}

              <div className="rounded-[16px] border border-zinc-800 bg-zinc-950/50 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-100">
                  <Smartphone className="h-4 w-4 text-indigo-300" />
                  Mobiele PWA
                </div>
                <p className="text-sm leading-6 text-zinc-400">
                  Op telefoon staat snelle invoer bovenaan, met een grote
                  bevestig-knop en speciale tankvelden voor de gezinsauto.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="order-5 grid gap-4 lg:order-none lg:grid-cols-3">
          {initialData.recurringExpenses.map((expense) => (
            <div
              key={expense.id}
              className="rounded-[16px] border border-zinc-900 bg-zinc-950/40 p-4"
            >
              <p className="text-sm font-medium text-zinc-100">{expense.name}</p>
              <p className="mt-1 text-xs text-zinc-500">
                Vanaf {expense.startsOn} · {labels.get(expense.categoryId)?.name}
              </p>
              <p className="mt-4 text-xl font-semibold text-zinc-50">
                {currency(expense.currentAmount)}
              </p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

function QuickEntryCard({
  amount,
  date,
  note,
  category,
  fuelLiters,
  categories,
  vehicles,
  onAmountChange,
  onDateChange,
  onNoteChange,
  onCategoryChange,
  onFuelLitersChange,
  isScanningReceipt,
  scanMessage,
  onScanReceipt,
  onSubmit,
}: {
  amount: string;
  date: string;
  note: string;
  category: string;
  fuelLiters: string;
  categories: DashboardData["categories"];
  vehicles: DashboardData["vehicles"];
  onAmountChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onFuelLitersChange: (value: string) => void;
  isScanningReceipt: boolean;
  scanMessage: string;
  onScanReceipt: (file: File) => void;
  onSubmit: () => void;
}) {
  const variableCategories = categories.filter(
    (item) => item.kind === "variable" || item.kind === "both",
  );
  const isFuel =
    variableCategories.find((item) => item.id === category)?.name === "Tanken";
  const vehicleName = vehicles[0]?.name ?? "Gezinsauto";

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Snelle invoer</CardTitle>
        <CardDescription>
          Groot, mobiel en zonder spreadsheet-gevoel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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

        <div className="grid grid-cols-3 gap-2">
          {variableCategories.map((item) => (
            <button
              key={item.id}
              className={cn(
                "flex min-h-20 flex-col items-center justify-center gap-2 rounded-[16px] border border-zinc-800 bg-zinc-950/50 p-2 text-sm font-medium text-zinc-400 transition",
                category === item.id &&
                  "border-indigo-400/70 bg-indigo-500/15 text-zinc-50",
              )}
              onClick={() => onCategoryChange(item.id)}
            >
              {item.id === "fuel" ? (
                <Fuel className="h-5 w-5" />
              ) : item.id === "groceries" ? (
                <WalletCards className="h-5 w-5" />
              ) : (
                <ReceiptText className="h-5 w-5" />
              )}
              {item.name}
            </button>
          ))}
        </div>

        <Input
          inputMode="decimal"
          placeholder="Bedrag"
          value={amount}
          onChange={(event) => onAmountChange(event.target.value)}
        />

        {isFuel && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              inputMode="decimal"
              placeholder="Liters"
              value={fuelLiters}
              onChange={(event) => onFuelLitersChange(event.target.value)}
            />
            <div className="flex h-12 items-center gap-2 rounded-[12px] border border-zinc-800 bg-zinc-950/70 px-3 text-sm text-zinc-300">
              <Car className="h-4 w-4 text-sky-300" />
              {vehicleName}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            type="date"
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
          />
          <Select
            value={category}
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
          onChange={(event) => onNoteChange(event.target.value)}
        />

        <div className="sticky bottom-3 z-10 pt-2">
          <Button className="h-14 w-full text-base" onClick={onSubmit}>
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
    <Card className="p-5">
      <div
        className={cn(
          "mb-5 flex h-11 w-11 items-center justify-center rounded-[14px]",
          tone === "indigo" && "bg-indigo-500/15 text-indigo-300",
          tone === "emerald" && "bg-emerald-500/15 text-emerald-300",
          tone === "red" && "bg-red-500/15 text-red-300",
          tone === "zinc" && "bg-zinc-900 text-zinc-300",
        )}
      >
        {icon}
      </div>
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-normal text-zinc-50">
        {value}
      </p>
    </Card>
  );
}

const tooltipStyle = {
  background: "#18181B",
  border: "1px solid #27272A",
  borderRadius: 12,
  color: "#FAFAFA",
};
