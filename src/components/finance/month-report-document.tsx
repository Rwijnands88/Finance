import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type React from "react";
import type { Category, Transaction } from "@/lib/types";
import { categoryById, totalsForMonth } from "@/lib/finance";
import { currency, monthLabel } from "@/lib/utils";

export type MonthReportFixedItem = {
  id: string;
  date: string;
  name: string;
  categoryName: string;
  amount: number;
  status: string;
  note?: string;
};

type MonthReportDocumentProps = {
  month: string;
  transactions: Transaction[];
  categories: Category[];
  fixedItems: MonthReportFixedItem[];
  generatedAt: string;
  receiptImages: Record<string, string>;
};

export function MonthReportDocument({
  month,
  transactions,
  categories,
  fixedItems,
  generatedAt,
  receiptImages,
}: MonthReportDocumentProps) {
  const labels = categoryById(categories);
  const monthTransactions = transactions
    .filter((transaction) => transaction.date.startsWith(month))
    .sort((first, second) => first.date.localeCompare(second.date));
  const totals = totalsForMonth(transactions, month);
  const accountSummaries = summarizeByAccount(monthTransactions);
  const variableGroups = groupVariableTransactions(monthTransactions, labels);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>Finance</Text>
            <Text style={styles.title}>Finance - {monthLabel(month)}</Text>
          </View>
          <View style={styles.generatedBox}>
            <Text style={styles.generatedLabel}>Aangemaakt</Text>
            <Text style={styles.generatedValue}>{generatedAt}</Text>
          </View>
        </View>

        <View style={styles.summary}>
          <SummaryBox label="Stortingen" value={currency(totals.contributionTotal)} />
          <SummaryBox label="Inkomsten" value={currency(totals.incomeTotal)} />
          <SummaryBox label="Vaste lasten" value={currency(totals.fixedTotal)} />
          <SummaryBox label="Variabel" value={currency(totals.variableTotal)} />
          <SummaryBox label="Over/tekort" value={currency(totals.netTotal)} />
        </View>

        <Section title="Samenvatting per rekening">
          <View style={styles.table}>
            <View style={styles.rowHeader}>
              <Text style={styles.accountCell}>Rekening</Text>
              <Text style={styles.amountCell}>In</Text>
              <Text style={styles.amountCell}>Vast</Text>
              <Text style={styles.amountCell}>Variabel</Text>
              <Text style={styles.amountCell}>Over</Text>
            </View>
            {accountSummaries.map((account) => (
              <View key={account.name} style={styles.row}>
                <Text style={styles.accountCell}>{account.name}</Text>
                <Text style={styles.amountCell}>
                  {currency(account.contribution + account.income)}
                </Text>
                <Text style={styles.amountCell}>{currency(account.fixed)}</Text>
                <Text style={styles.amountCell}>{currency(account.variable)}</Text>
                <Text style={styles.amountCell}>{currency(account.net)}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Vaste lasten">
          <View style={styles.table}>
            <View style={styles.rowHeader}>
              <Text style={styles.dateCell}>Datum</Text>
              <Text style={styles.nameCell}>Naam</Text>
              <Text style={styles.categoryCell}>Categorie</Text>
              <Text style={styles.statusCell}>Status</Text>
              <Text style={styles.amountCell}>Bedrag</Text>
            </View>
            {fixedItems.length ? (
              fixedItems.map((item) => (
                <View key={item.id} style={styles.row}>
                  <Text style={styles.dateCell}>{item.date}</Text>
                  <Text style={styles.nameCell}>{item.name}</Text>
                  <Text style={styles.categoryCell}>{item.categoryName}</Text>
                  <Text style={styles.statusCell}>{item.status}</Text>
                  <Text style={styles.amountCell}>{currency(item.amount)}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>Geen vaste lasten in deze maand.</Text>
            )}
          </View>
        </Section>

        <Section title="Variabele kosten per categorie">
          {variableGroups.length ? (
            variableGroups.map((group) => (
              <View key={group.categoryName} style={styles.group} wrap={false}>
                <View style={styles.groupHeader}>
                  <Text style={styles.groupTitle}>{group.categoryName}</Text>
                  <Text style={styles.groupTotal}>{currency(group.total)}</Text>
                </View>
                {group.transactions.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    receiptImage={receiptImages[transaction.id]}
                  />
                ))}
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>Geen variabele kosten in deze maand.</Text>
          )}
        </Section>

        <Section title="Totaal per rekening">
          <View style={styles.table}>
            {accountSummaries.map((account) => (
              <View key={`total-${account.name}`} style={styles.totalRow}>
                <Text style={styles.accountCell}>{account.name}</Text>
                <Text style={styles.totalAmount}>{currency(account.net)}</Text>
              </View>
            ))}
          </View>
        </Section>
      </Page>
    </Document>
  );
}

function TransactionRow({
  transaction,
  receiptImage,
}: {
  transaction: Transaction;
  receiptImage?: string;
}) {
  return (
    <View style={styles.transactionBlock}>
      <View style={styles.transactionRow}>
        <Text style={styles.dateCell}>{transaction.date}</Text>
        <Text style={styles.transactionNote}>
          {[transaction.accountName, transaction.note ?? transaction.enteredBy]
            .filter(Boolean)
            .join(" - ")}
        </Text>
        <Text style={styles.amountCell}>{currency(transaction.amount)}</Text>
      </View>
      {receiptImage && (
        <Image src={receiptImage} style={styles.receiptImage} />
      )}
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

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryBox}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function summarizeByAccount(transactions: Transaction[]) {
  const summaries = new Map<
    string,
    {
      name: string;
      contribution: number;
      income: number;
      fixed: number;
      variable: number;
      net: number;
    }
  >();

  transactions.forEach((transaction) => {
    const name = transaction.accountName ?? "Onbekende rekening";
    const summary =
      summaries.get(name) ??
      {
        name,
        contribution: 0,
        income: 0,
        fixed: 0,
        variable: 0,
        net: 0,
      };

    if (transaction.type === "contribution") {
      summary.contribution += transaction.amount;
      summary.net += transaction.amount;
    } else if (transaction.type === "income") {
      summary.income += transaction.amount;
      summary.net += transaction.amount;
    } else if (transaction.type === "fixed") {
      summary.fixed += transaction.amount;
      summary.net -= transaction.amount;
    } else {
      summary.variable += transaction.amount;
      summary.net -= transaction.amount;
    }

    summaries.set(name, summary);
  });

  return Array.from(summaries.values()).sort((first, second) =>
    first.name.localeCompare(second.name, "nl"),
  );
}

function groupVariableTransactions(
  transactions: Transaction[],
  labels: Map<string, Category>,
) {
  const groups = new Map<
    string,
    {
      categoryName: string;
      total: number;
      transactions: Transaction[];
    }
  >();

  transactions
    .filter((transaction) => transaction.type === "variable")
    .forEach((transaction) => {
      const categoryName = labels.get(transaction.categoryId)?.name ?? "Onbekend";
      const group =
        groups.get(categoryName) ??
        {
          categoryName,
          total: 0,
          transactions: [],
        };

      group.total += transaction.amount;
      group.transactions.push(transaction);
      groups.set(categoryName, group);
    });

  return Array.from(groups.values()).sort((first, second) => second.total - first.total);
}

const styles = StyleSheet.create({
  page: {
    padding: 32,
    backgroundColor: "#FFFFFF",
    color: "#18181B",
    fontSize: 9,
    lineHeight: 1.35,
  },
  header: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  kicker: {
    color: "#6366F1",
    fontSize: 10,
    marginBottom: 5,
  },
  title: {
    fontSize: 23,
    fontWeight: 700,
  },
  generatedBox: {
    border: "1px solid #E4E4E7",
    borderRadius: 8,
    padding: 9,
    minWidth: 96,
  },
  generatedLabel: {
    color: "#71717A",
    fontSize: 8,
    marginBottom: 4,
  },
  generatedValue: {
    fontSize: 10,
    fontWeight: 700,
  },
  summary: {
    display: "flex",
    flexDirection: "row",
    gap: 7,
    marginBottom: 18,
  },
  summaryBox: {
    flex: 1,
    border: "1px solid #E4E4E7",
    borderRadius: 9,
    padding: 9,
  },
  summaryLabel: {
    color: "#71717A",
    fontSize: 8,
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: 700,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 7,
  },
  table: {
    border: "1px solid #E4E4E7",
    borderRadius: 8,
  },
  rowHeader: {
    display: "flex",
    flexDirection: "row",
    backgroundColor: "#F4F4F5",
    padding: 8,
    fontWeight: 700,
  },
  row: {
    display: "flex",
    flexDirection: "row",
    borderTop: "1px solid #E4E4E7",
    padding: 8,
  },
  dateCell: { width: 70 },
  accountCell: { flex: 1.3 },
  nameCell: { flex: 1.15 },
  categoryCell: { flex: 1 },
  statusCell: { width: 78 },
  amountCell: { width: 64, textAlign: "right" },
  transactionNote: { flex: 1 },
  emptyText: {
    padding: 10,
    color: "#71717A",
  },
  group: {
    border: "1px solid #E4E4E7",
    borderRadius: 8,
    marginBottom: 8,
  },
  groupHeader: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#F9FAFB",
    padding: 8,
  },
  groupTitle: {
    fontWeight: 700,
  },
  groupTotal: {
    fontWeight: 700,
  },
  transactionBlock: {
    borderTop: "1px solid #E4E4E7",
    padding: 8,
  },
  transactionRow: {
    display: "flex",
    flexDirection: "row",
  },
  receiptImage: {
    width: 180,
    maxHeight: 180,
    objectFit: "contain",
    marginTop: 8,
    border: "1px solid #E4E4E7",
    borderRadius: 6,
  },
  totalRow: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 9,
    borderTop: "1px solid #E4E4E7",
  },
  totalAmount: {
    width: 90,
    textAlign: "right",
    fontWeight: 700,
  },
});
