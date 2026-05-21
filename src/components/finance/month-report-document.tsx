import {
  Circle,
  Document,
  Image,
  Line,
  Page,
  Path,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import React from "react";
import type { Category, Transaction } from "@/lib/types";
import { categoryById } from "@/lib/finance";
import { monthLabel, preciseCurrency } from "@/lib/utils";

const ACCENT = "#6366F1";
const POSITIVE = "#10B981";
const NEGATIVE = "#EF4444";
const AMBER = "#F59E0B";
const MUTED = "#71717A";
const BORDER = "#E4E4E7";
const DARK = "#18181B";
const CATEGORY_COLORS = [
  ACCENT,
  POSITIVE,
  NEGATIVE,
  AMBER,
  "#06B6D4",
  "#A855F7",
  "#14B8A6",
  "#F97316",
];

export type MonthReportFixedItem = {
  id: string;
  date: string;
  name: string;
  categoryName: string;
  amount: number;
  status: string;
  note?: string;
};

export type MonthReportTrendItem = {
  month: string;
  fixed: number;
  variable: number;
  contribution?: number;
  income?: number;
};

type MonthReportDocumentProps = {
  month: string;
  accountName: string;
  transactions: Transaction[];
  categories: Category[];
  fixedItems: MonthReportFixedItem[];
  trend: MonthReportTrendItem[];
  generatedAt: string;
  receiptImages: Record<string, string>;
};

export function MonthReportDocument({
  month,
  accountName,
  transactions,
  categories,
  fixedItems,
  trend,
  generatedAt,
  receiptImages,
}: MonthReportDocumentProps) {
  const labels = categoryById(categories);
  const monthTransactions = transactions
    .filter((transaction) => transaction.date.startsWith(month))
    .sort(
      (first, second) =>
        first.date.localeCompare(second.date) ||
        transactionTitle(first, labels).localeCompare(
          transactionTitle(second, labels),
          "nl",
        ),
    );
  const reportTotals = buildReportTotals(monthTransactions, fixedItems);
  const categoryRows = buildCategoryRows(monthTransactions, fixedItems, labels);
  const transactionGroups = buildTransactionGroups(monthTransactions, labels);
  const fixedSubtotal = fixedItems
    .filter((item) => item.status !== "overgeslagen")
    .reduce((total, item) => total + item.amount, 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <ReportHeader
          month={month}
          accountName={accountName}
          generatedAt={generatedAt}
        />

        <View style={styles.summaryGrid}>
          <SummaryBox
            label="Stortingen"
            value={preciseCurrency(reportTotals.inflow)}
            tone="positive"
          />
          <SummaryBox
            label="Vaste lasten"
            value={preciseCurrency(reportTotals.fixed)}
            tone="negative"
          />
          <SummaryBox
            label="Variabele kosten"
            value={preciseCurrency(reportTotals.variable)}
            tone="negative"
          />
          <SummaryBox
            label="Eindsaldo"
            value={preciseCurrency(reportTotals.net)}
            tone={reportTotals.net >= 0 ? "positive" : "negative"}
          />
        </View>

        <View style={styles.chartGrid}>
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Kostenverdeling</Text>
            {categoryRows.length ? (
              <View style={styles.pieLayout}>
                <PieChart rows={categoryRows} />
                <View style={styles.legend}>
                  {categoryRows.map((row) => (
                    <LegendRow
                      key={row.name}
                      color={row.color}
                      label={row.name}
                      value={`${preciseCurrency(row.amount)} · ${Math.round(
                        row.percentage,
                      )}%`}
                    />
                  ))}
                </View>
              </View>
            ) : (
              <Text style={styles.emptyText}>Geen kosten in deze maand.</Text>
            )}
          </View>

          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Afgelopen 6 maanden</Text>
            {trend.length ? (
              <>
                <TrendChart rows={trend} />
                <View style={styles.inlineLegend}>
                  <LegendRow color={POSITIVE} label="Stortingen" value="" compact />
                  <LegendRow color={NEGATIVE} label="Uitgaven" value="" compact />
                </View>
              </>
            ) : (
              <Text style={styles.emptyText}>Nog geen trenddata.</Text>
            )}
          </View>
        </View>

        <View style={styles.noteBox}>
          <Text style={styles.noteTitle}>Maandbeeld</Text>
          <Text style={styles.noteText}>
            Dit rapport combineert stortingen, vaste lasten en variabele kosten
            voor {accountName}. Bedragen zijn bedoeld als administratief
            maandbeeld en sluiten aan op de handmatige invoer in Finance.
          </Text>
        </View>
      </Page>

      <Page size="A4" style={styles.page}>
        <ReportHeader
          month={month}
          accountName={accountName}
          generatedAt={generatedAt}
          compact
        />

        <Section title="Transactiedetail">
          <View style={styles.subtotalGrid}>
            <SubtotalBox label="Bij" value={reportTotals.inflow} positive />
            <SubtotalBox
              label="Af"
              value={reportTotals.fixed + reportTotals.variable + reportTotals.savings}
            />
            <SubtotalBox
              label="Netto"
              value={reportTotals.net}
              positive={reportTotals.net >= 0}
            />
          </View>

          {monthTransactions.length > 0 && (
            <View style={styles.detailGroup}>
              <View style={styles.detailGroupHeader}>
                <Text style={styles.detailGroupTitle}>Alle transacties</Text>
                <Text
                  style={[
                    styles.detailGroupTotal,
                    reportTotals.net >= 0 ? styles.positiveText : styles.negativeText,
                  ]}
                >
                  {reportTotals.net >= 0 ? "+" : "-"}
                  {preciseCurrency(Math.abs(reportTotals.net))}
                </Text>
              </View>
              {monthTransactions.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  labels={labels}
                  receiptImage={receiptImages[transaction.id]}
                />
              ))}
            </View>
          )}

          {transactionGroups.length > 0 && (
            <View style={styles.subtotalList}>
              <View style={styles.subtotalHeader}>
                <Text style={styles.subtotalHeaderText}>
                  Subtotalen per type/categorie
                </Text>
              </View>
              {transactionGroups.map((group) => (
                <View key={group.name} style={styles.subtotalRow}>
                  <Text style={styles.subtotalRowLabel}>{group.name}</Text>
                  <Text
                    style={[
                      styles.subtotalRowValue,
                      group.total >= 0 ? styles.positiveText : styles.negativeText,
                    ]}
                  >
                    {group.total >= 0 ? "+" : "-"}
                    {preciseCurrency(Math.abs(group.total))}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {!monthTransactions.length && (
            <Text style={styles.emptyText}>Geen transacties in deze maand.</Text>
          )}
        </Section>

        <Section title="Vaste lasten status">
          <View style={styles.fixedHeader}>
            <Text style={styles.fixedTitle}>Vaste lasten</Text>
            <Text style={styles.fixedTotal}>
              Totaal {preciseCurrency(fixedSubtotal)}
            </Text>
          </View>
          <View style={styles.fixedTable}>
            <View style={styles.tableHeader}>
              <Text style={styles.dateCell}>Datum</Text>
              <Text style={styles.nameCell}>Naam</Text>
              <Text style={styles.categoryCell}>Categorie</Text>
              <Text style={styles.statusCell}>Status</Text>
              <Text style={styles.amountCell}>Bedrag</Text>
            </View>
            {fixedItems.length ? (
              fixedItems.map((item) => (
                <View key={item.id} style={styles.tableRow}>
                  <Text style={styles.dateCell}>{item.date}</Text>
                  <Text style={styles.nameCell}>{item.name}</Text>
                  <Text style={styles.categoryCell}>{item.categoryName}</Text>
                  <Text style={styles.statusCell}>
                    Vaste last · {item.status}
                  </Text>
                  <Text
                    style={[
                      styles.amountCell,
                      item.status === "overgeslagen"
                        ? styles.mutedText
                        : styles.negativeText,
                    ]}
                  >
                    {item.status === "overgeslagen" ? "" : "-"}
                    {preciseCurrency(item.amount)}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>Geen vaste lasten in deze maand.</Text>
            )}
          </View>
        </Section>
      </Page>
    </Document>
  );
}

function ReportHeader({
  month,
  accountName,
  generatedAt,
  compact = false,
}: {
  month: string;
  accountName: string;
  generatedAt: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.header, compact ? styles.compactHeader : {}]}>
      <View>
        <Text style={styles.kicker}>Finance</Text>
        <Text style={styles.title}>Maandrapport</Text>
        {!compact && <Text style={styles.generated}>Aangemaakt {generatedAt}</Text>}
      </View>
      <View style={styles.headerMeta}>
        <Text style={styles.headerMonth}>{monthLabel(month)}</Text>
        <Text style={styles.headerAccount}>{accountName}</Text>
      </View>
    </View>
  );
}

function SummaryBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "positive" | "negative";
}) {
  return (
    <View style={[styles.summaryBox, tone === "positive" ? styles.summaryPositive : styles.summaryNegative]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function SubtotalBox({
  label,
  value,
  positive = false,
}: {
  label: string;
  value: number;
  positive?: boolean;
}) {
  return (
    <View style={styles.subtotalBox}>
      <Text style={styles.subtotalLabel}>{label}</Text>
      <Text style={[styles.subtotalValue, positive ? styles.positiveText : styles.negativeText]}>
        {positive ? "+" : "-"}
        {preciseCurrency(Math.abs(value))}
      </Text>
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function TransactionRow({
  transaction,
  labels,
  receiptImage,
}: {
  transaction: Transaction;
  labels: Map<string, Category>;
  receiptImage?: string;
}) {
  const signedAmount = signedTransactionAmount(transaction);
  const isPositive = signedAmount >= 0;

  return (
    <View style={styles.transactionBlock}>
      <View style={styles.transactionRow}>
        <Text style={styles.dateCell}>{transaction.date}</Text>
        <View style={styles.transactionDetailCell}>
          <Text style={styles.transactionName}>
            {transactionTitle(transaction, labels)}
          </Text>
          <Text style={styles.transactionMeta}>
            Betaald door: {transaction.paidBy ?? transaction.enteredBy}
          </Text>
          {transaction.note && (
            <Text style={styles.transactionMeta}>Notitie: {transaction.note}</Text>
          )}
        </View>
        <Text
          style={[
            styles.amountCell,
            isPositive ? styles.positiveText : styles.negativeText,
          ]}
        >
          {isPositive ? "+" : "-"}
          {preciseCurrency(Math.abs(signedAmount))}
        </Text>
      </View>
      {receiptImage && (
        // eslint-disable-next-line jsx-a11y/alt-text
        <Image src={receiptImage} style={styles.receiptImage} />
      )}
    </View>
  );
}

function LegendRow({
  color,
  label,
  value,
  compact = false,
}: {
  color: string;
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.legendRow, compact ? styles.compactLegendRow : {}]}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
      {value ? <Text style={styles.legendValue}>{value}</Text> : null}
    </View>
  );
}

function PieChart({
  rows,
}: {
  rows: Array<{ name: string; amount: number; color: string; percentage: number }>;
}) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const { slices } = rows.reduce(
    (result, row) => {
      const angle = total > 0 ? (row.amount / total) * 360 : 0;
      const path = describeArc(
        75,
        75,
        54,
        result.startAngle,
        result.startAngle + angle,
      );

      return {
        startAngle: result.startAngle + angle,
        slices: [...result.slices, { row, path }],
      };
    },
    {
      startAngle: -90,
      slices: [] as Array<{
        row: { name: string; color: string };
        path: string;
      }>,
    },
  );

  return (
    <Svg width={150} height={150} viewBox="0 0 150 150">
      <Circle cx={75} cy={75} r={53} fill="#F4F4F5" />
      {slices.map(({ row, path }) => (
        <Path key={row.name} d={path} fill={row.color} />
      ))}
      <Circle cx={75} cy={75} r={28} fill="#FFFFFF" />
    </Svg>
  );
}

function TrendChart({ rows }: { rows: MonthReportTrendItem[] }) {
  const chartWidth = 230;
  const chartHeight = 116;
  const padding = 16;
  const barGroupWidth = (chartWidth - padding * 2) / Math.max(rows.length, 1);
  const maxValue = Math.max(
    ...rows.map((row) =>
      Math.max((row.contribution ?? 0) + (row.income ?? 0), row.fixed + row.variable),
    ),
    1,
  );

  return (
    <Svg width={chartWidth} height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
      <Line
        x1={padding}
        y1={chartHeight - padding}
        x2={chartWidth - padding}
        y2={chartHeight - padding}
        stroke="#D4D4D8"
        strokeWidth={1}
      />
      {rows.map((row, index) => {
        const inflow = (row.contribution ?? 0) + (row.income ?? 0);
        const outflow = row.fixed + row.variable;
        const x = padding + index * barGroupWidth + barGroupWidth * 0.22;
        const inflowHeight = (inflow / maxValue) * (chartHeight - padding * 2);
        const outflowHeight = (outflow / maxValue) * (chartHeight - padding * 2);

        return (
          <React.Fragment key={`${row.month}-${index}`}>
            <Rect
              x={x}
              y={chartHeight - padding - inflowHeight}
              width={barGroupWidth * 0.18}
              height={inflowHeight}
              rx={2}
              fill={POSITIVE}
            />
            <Rect
              x={x + barGroupWidth * 0.24}
              y={chartHeight - padding - outflowHeight}
              width={barGroupWidth * 0.18}
              height={outflowHeight}
              rx={2}
              fill={NEGATIVE}
            />
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

function buildReportTotals(
  transactions: Transaction[],
  fixedItems: MonthReportFixedItem[],
) {
  const contribution = transactions
    .filter((transaction) => transaction.type === "contribution")
    .reduce((total, transaction) => total + transaction.amount, 0);
  const income = transactions
    .filter((transaction) => transaction.type === "income")
    .reduce((total, transaction) => total + transaction.amount, 0);
  const variable = transactions
    .filter((transaction) => transaction.type === "variable")
    .reduce((total, transaction) => total + transaction.amount, 0);
  const savings = transactions
    .filter((transaction) => transaction.type === "sparen")
    .reduce((total, transaction) => total + transaction.amount, 0);
  const fixed = fixedItems
    .filter((item) => item.status !== "overgeslagen")
    .reduce((total, item) => total + item.amount, 0);
  const inflow = contribution + income;

  return {
    contribution,
    income,
    inflow,
    fixed,
    variable,
    savings,
    net: inflow - fixed - variable - savings,
  };
}

function buildCategoryRows(
  transactions: Transaction[],
  fixedItems: MonthReportFixedItem[],
  labels: Map<string, Category>,
) {
  const grouped = new Map<string, { name: string; amount: number; color: string }>();

  transactions
    .filter((transaction) => transaction.type === "variable")
    .forEach((transaction) => {
      const category = labels.get(transaction.categoryId);
      const name = category?.name ?? "Onbekend";
      const current = grouped.get(name) ?? {
        name,
        amount: 0,
        color: category?.color ?? CATEGORY_COLORS[grouped.size % CATEGORY_COLORS.length],
      };

      current.amount += transaction.amount;
      grouped.set(name, current);
    });

  fixedItems
    .filter((item) => item.status !== "overgeslagen")
    .forEach((item) => {
      const current = grouped.get(item.categoryName) ?? {
        name: item.categoryName,
        amount: 0,
        color: CATEGORY_COLORS[grouped.size % CATEGORY_COLORS.length],
      };

      current.amount += item.amount;
      grouped.set(item.categoryName, current);
    });

  const rows = Array.from(grouped.values()).sort(
    (first, second) => second.amount - first.amount,
  );
  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  return rows.map((row, index) => ({
    ...row,
    color: row.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length],
    percentage: total > 0 ? (row.amount / total) * 100 : 0,
  }));
}

function buildTransactionGroups(
  transactions: Transaction[],
  labels: Map<string, Category>,
) {
  const groups = new Map<
    string,
    {
      name: string;
      total: number;
      transactions: Transaction[];
    }
  >();

  transactions.forEach((transaction) => {
    const name =
      transaction.type === "contribution" || transaction.type === "income"
        ? "Bijschrijvingen"
        : transaction.type === "sparen"
          ? "Sparen"
        : transaction.type === "fixed"
          ? "Vaste lasten transacties"
          : labels.get(transaction.categoryId)?.name ?? "Uitgaven";
    const current = groups.get(name) ?? { name, total: 0, transactions: [] };

    current.total += signedTransactionAmount(transaction);
    current.transactions.push(transaction);
    groups.set(name, current);
  });

  return Array.from(groups.values()).sort((first, second) =>
    first.name.localeCompare(second.name, "nl"),
  );
}

function transactionTitle(
  transaction: Transaction,
  labels: Map<string, Category>,
) {
  if (transaction.type === "contribution") {
    return contributionDisplayName(transaction);
  }

  if (transaction.type === "income") {
    return labels.get(transaction.categoryId)?.name ?? "Inkomen";
  }

  if (transaction.type === "fixed") {
    return labels.get(transaction.categoryId)?.name ?? "Vaste last";
  }

  if (transaction.type === "sparen") {
    return "Sparen";
  }

  return labels.get(transaction.categoryId)?.name ?? "Uitgave";
}

function contributionDisplayName(
  transaction: Pick<Transaction, "contributionKind" | "enteredBy" | "paidBy">,
) {
  const label =
    transaction.contributionKind === "planned"
      ? "Reguliere storting"
      : transaction.contributionKind === "extra"
        ? "Extra storting"
        : transaction.contributionKind === "belastingteruggave"
          ? "Belastingteruggave"
          : "Storting";

  return `${label} - ${transaction.paidBy ?? transaction.enteredBy}`;
}

function signedTransactionAmount(transaction: Transaction) {
  return transaction.type === "contribution" || transaction.type === "income"
    ? transaction.amount
    : -transaction.amount;
}

function describeArc(
  x: number,
  y: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    `M ${x} ${y}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
}

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number,
) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

const styles = StyleSheet.create({
  page: {
    padding: 30,
    backgroundColor: "#FFFFFF",
    color: DARK,
    fontSize: 9,
    lineHeight: 1.35,
  },
  header: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 14,
    borderBottom: `1px solid ${BORDER}`,
    marginBottom: 16,
  },
  compactHeader: {
    marginBottom: 13,
  },
  kicker: {
    color: ACCENT,
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 3,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
  },
  generated: {
    color: MUTED,
    fontSize: 8,
    marginTop: 5,
  },
  headerMeta: {
    textAlign: "right",
    border: `1px solid ${BORDER}`,
    borderRadius: 9,
    padding: 9,
    minWidth: 160,
  },
  headerMonth: {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 3,
  },
  headerAccount: {
    color: MUTED,
    fontSize: 9,
  },
  summaryGrid: {
    display: "flex",
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  summaryBox: {
    flex: 1,
    borderRadius: 12,
    padding: 10,
    border: `1px solid ${BORDER}`,
    minHeight: 58,
  },
  summaryPositive: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  summaryNegative: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  summaryLabel: {
    color: MUTED,
    fontSize: 8,
    marginBottom: 7,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: 700,
  },
  chartGrid: {
    display: "flex",
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  chartCard: {
    flex: 1,
    border: `1px solid ${BORDER}`,
    borderRadius: 12,
    padding: 12,
    minHeight: 218,
  },
  chartTitle: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 9,
  },
  pieLayout: {
    display: "flex",
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  legend: {
    flex: 1,
    gap: 5,
  },
  inlineLegend: {
    display: "flex",
    flexDirection: "row",
    gap: 14,
    marginTop: 5,
  },
  legendRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 4,
  },
  compactLegendRow: {
    marginBottom: 0,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  legendLabel: {
    flex: 1,
    fontSize: 8,
  },
  legendValue: {
    fontSize: 8,
    color: MUTED,
    textAlign: "right",
  },
  noteBox: {
    border: `1px solid ${BORDER}`,
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#FAFAFA",
  },
  noteTitle: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 6,
  },
  noteText: {
    color: MUTED,
    fontSize: 9,
  },
  section: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 8,
  },
  subtotalGrid: {
    display: "flex",
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  subtotalBox: {
    flex: 1,
    border: `1px solid ${BORDER}`,
    borderRadius: 9,
    padding: 8,
  },
  subtotalLabel: {
    color: MUTED,
    fontSize: 8,
    marginBottom: 4,
  },
  subtotalValue: {
    fontSize: 12,
    fontWeight: 700,
  },
  detailGroup: {
    border: `1px solid ${BORDER}`,
    borderRadius: 9,
    marginBottom: 8,
    overflow: "hidden",
  },
  detailGroupHeader: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#F4F4F5",
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  detailGroupTitle: {
    fontWeight: 700,
  },
  detailGroupTotal: {
    fontWeight: 700,
  },
  subtotalList: {
    border: `1px solid ${BORDER}`,
    borderRadius: 9,
    marginBottom: 8,
    overflow: "hidden",
  },
  subtotalHeader: {
    backgroundColor: "#F4F4F5",
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  subtotalHeaderText: {
    fontSize: 8,
    fontWeight: 700,
    color: DARK,
  },
  subtotalRow: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: `1px solid ${BORDER}`,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  subtotalRowLabel: {
    color: MUTED,
    fontSize: 8,
  },
  subtotalRowValue: {
    fontSize: 8,
    fontWeight: 700,
  },
  transactionBlock: {
    borderTop: `1px solid ${BORDER}`,
    padding: 8,
  },
  transactionRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-start",
  },
  transactionDetailCell: {
    flex: 1,
    paddingRight: 8,
  },
  transactionName: {
    fontWeight: 700,
    marginBottom: 2,
  },
  transactionMeta: {
    color: MUTED,
    fontSize: 8,
    marginTop: 1,
  },
  receiptImage: {
    width: 170,
    maxHeight: 170,
    objectFit: "contain",
    marginTop: 8,
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
  },
  fixedHeader: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 7,
  },
  fixedTitle: {
    fontWeight: 700,
  },
  fixedTotal: {
    color: MUTED,
  },
  fixedTable: {
    border: `1px solid ${BORDER}`,
    borderRadius: 9,
    overflow: "hidden",
  },
  tableHeader: {
    display: "flex",
    flexDirection: "row",
    backgroundColor: "#1E1E2E",
    color: "#FFFFFF",
    paddingVertical: 7,
    paddingHorizontal: 8,
    fontWeight: 700,
  },
  tableRow: {
    display: "flex",
    flexDirection: "row",
    borderTop: `1px solid ${BORDER}`,
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  dateCell: {
    width: 68,
  },
  nameCell: {
    flex: 1.15,
  },
  categoryCell: {
    flex: 1,
  },
  statusCell: {
    width: 108,
  },
  amountCell: {
    width: 76,
    textAlign: "right",
  },
  emptyText: {
    padding: 10,
    color: MUTED,
  },
  positiveText: {
    color: POSITIVE,
  },
  negativeText: {
    color: NEGATIVE,
  },
  mutedText: {
    color: MUTED,
  },
});
