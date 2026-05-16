import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { Category, Transaction } from "@/lib/types";
import { categoryById, totalsForMonth } from "@/lib/finance";
import { currency, monthLabel } from "@/lib/utils";

type MonthReportDocumentProps = {
  month: string;
  transactions: Transaction[];
  categories: Category[];
};

export function MonthReportDocument({
  month,
  transactions,
  categories,
}: MonthReportDocumentProps) {
  const labels = categoryById(categories);
  const monthTransactions = transactions.filter((transaction) =>
    transaction.date.startsWith(month),
  );
  const totals = totalsForMonth(transactions, month);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Huishouden Ralph & Dorine</Text>
          <Text style={styles.title}>Maandrapport {monthLabel(month)}</Text>
        </View>

        <View style={styles.summary}>
          <SummaryBox label="Inleg" value={currency(totals.contributionTotal)} />
          <SummaryBox label="Vaste lasten" value={currency(totals.fixedTotal)} />
          <SummaryBox label="Uitgaven" value={currency(totals.expenseTotal)} />
          <SummaryBox label="Over" value={currency(totals.netTotal)} />
        </View>

        <View style={styles.table}>
          <View style={styles.rowHeader}>
            <Text style={styles.cellDate}>Datum</Text>
            <Text style={styles.cellCategory}>Categorie</Text>
            <Text style={styles.cellNote}>Notitie</Text>
            <Text style={styles.cellAmount}>Bedrag</Text>
          </View>

          {monthTransactions.map((transaction) => (
            <View key={transaction.id} style={styles.row}>
              <Text style={styles.cellDate}>{transaction.date}</Text>
              <Text style={styles.cellCategory}>
                {transaction.type === "contribution"
                  ? "Inleg"
                  : labels.get(transaction.categoryId)?.name ?? "Onbekend"}
              </Text>
              <Text style={styles.cellNote}>
                {[transaction.accountName, transaction.note ?? transaction.enteredBy]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              <Text style={styles.cellAmount}>{currency(transaction.amount)}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
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

const styles = StyleSheet.create({
  page: {
    padding: 36,
    backgroundColor: "#FFFFFF",
    color: "#18181B",
    fontSize: 10,
  },
  header: {
    marginBottom: 24,
  },
  kicker: {
    color: "#6366F1",
    fontSize: 10,
    marginBottom: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
  },
  summary: {
    display: "flex",
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },
  summaryBox: {
    flex: 1,
    border: "1px solid #E4E4E7",
    borderRadius: 10,
    padding: 12,
  },
  summaryLabel: {
    color: "#71717A",
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: 700,
  },
  table: {
    border: "1px solid #E4E4E7",
    borderRadius: 8,
  },
  rowHeader: {
    display: "flex",
    flexDirection: "row",
    backgroundColor: "#F4F4F5",
    padding: 9,
    fontWeight: 700,
  },
  row: {
    display: "flex",
    flexDirection: "row",
    borderTop: "1px solid #E4E4E7",
    padding: 9,
  },
  cellDate: { width: 74 },
  cellCategory: { width: 120 },
  cellNote: { flex: 1 },
  cellAmount: { width: 74, textAlign: "right" },
});
