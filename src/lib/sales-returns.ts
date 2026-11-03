type Money = number | string | null | undefined;
export type RecordedReturn = {
  sale_id?: string | null;
  kind: string;
  refund: Money;
  gst_reversal?: Money;
  cost_reversal?: Money;
  qty?: number;
};
const amount = (value: Money) => Number(value ?? 0);
export const money = (value: number) => {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return rounded === 0 ? 0 : rounded;
};

/** Recorded financial returns only. Size exchanges have no refund/reversal. */
export function financialReturns<T extends RecordedReturn>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.kind !== "exchange");
}

export function returnSummary(rows: readonly RecordedReturn[]) {
  const financial = financialReturns(rows);
  return {
    refunded: money(financial.reduce((total, row) => total + amount(row.refund), 0)),
    gst: money(financial.reduce((total, row) => total + amount(row.gst_reversal), 0)),
    cost: money(financial.reduce((total, row) => total + amount(row.cost_reversal), 0)),
    pairs: financial.reduce((total, row) => total + (row.qty ?? 0), 0),
  };
}

/** Bill history/lifetime spending use all recorded returns for each original sale. */
export function refundsBySale(rows: readonly RecordedReturn[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of financialReturns(rows)) {
    if (row.sale_id)
      result.set(row.sale_id, money((result.get(row.sale_id) ?? 0) + amount(row.refund)));
  }
  return result;
}

/** Returns are recognised on their return date, not by rewriting the original sale. */
export function netSales(gross: number, rows: readonly RecordedReturn[]) {
  return money(gross - returnSummary(rows).refunded);
}

type Embedded<T> = T | T[] | null | undefined;
type CostLine = { sale_item_costs?: Embedded<{ unit_cost: Money }> };
const first = <T>(value: Embedded<T>) => (Array.isArray(value) ? value[0] : value);

/** A positive historical cost for every line is required. Never substitute today's cost. */
export function hasRecordedCosts(items: readonly CostLine[]): boolean {
  return (
    items.length > 0 && items.every((item) => amount(first(item.sale_item_costs)?.unit_cost) > 0)
  );
}

export function hasReturnCost(row: { refund: Money; sale_items?: Embedded<CostLine> }): boolean {
  return amount(row.refund) === 0 || hasRecordedCosts([first(row.sale_items) ?? {}]);
}

/** A return can clear credit due; that reduction was not a customer payment. */
export function originalBillReceipt(
  total: number,
  due: number,
  laterPayments: number,
  returns: readonly (RecordedReturn & { cash_refund?: Money })[],
) {
  const creditReversed = financialReturns(returns).reduce(
    (sum, row) => sum + amount(row.refund) - amount(row.cash_refund),
    0,
  );
  return Math.max(0, money(total - due - laterPayments - creditReversed));
}

/** Timestamp offsets may differ in JSON; compare instants, never ISO strings. */
export function inPeriod(value: string, start: string, end: string): boolean {
  const instant = Date.parse(value);
  return instant >= Date.parse(start) && instant < Date.parse(end);
}
export function refundPayouts(
  rows: readonly (RecordedReturn & { cash_refund?: Money; refund_mode?: string | null })[],
) {
  const financial = financialReturns(rows);
  return {
    cash: money(
      financial
        .filter((r) => r.refund_mode === "Cash")
        .reduce((s, r) => s + amount(r.cash_refund), 0),
    ),
    unknown: money(
      financial.filter((r) => !r.refund_mode).reduce((s, r) => s + amount(r.cash_refund), 0),
    ),
  };
}
