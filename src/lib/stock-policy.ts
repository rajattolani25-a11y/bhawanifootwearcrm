/** One rule for Dashboard, product chips and Inventory Control. Zero is separate. */
export const DEAD_STOCK_DAYS = 60;
export function isLowStock(stock: number, minimum: number) {
  return stock > 0 && stock <= Math.max(0, minimum);
}
export function isDeadStock(createdAt: string, soldRecently: boolean, now = Date.now()) {
  const created = Date.parse(createdAt);
  return Number.isFinite(created) && !soldRecently && now - created >= DEAD_STOCK_DAYS * 86400000;
}
