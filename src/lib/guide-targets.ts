// Visible, non-destructive landmarks only. A missing optional landmark is skipped.
export const guideTargets: Record<string, string[]> = {
  "/dashboard": ["main h1", "main section:nth-of-type(2)", "main section:nth-of-type(3)"],
  "/pos": ['main input[placeholder*="Scan barcode"]', 'main input[placeholder*="mobile"]', 'main input[placeholder*="coupon"]', 'main button[title="Scan with phone camera"]'],
  "/products": ['main input[placeholder*="Search brand"]', 'main button:has-text("Quick add")', "main section"],
  "/purchase": ['main input[placeholder="Invoice no"]', 'main input[placeholder="Search article to add sizes"]', 'main button:has-text("Receive stock")'],
  "/sales": ['main input[placeholder="Bill no, name or mobile"]', "main table", "main table thead"],
  "/suppliers": ['main input[placeholder="Name"]', 'main button:has-text("Add supplier")', "main .grid.md\\:grid-cols-2"],
  "/customers": ['main input[placeholder="Search mobile or name"]', 'main button:has-text("Add customer")', "main .grid"],
  "/coupons": ['main button:has-text("New coupon")', 'main button:has-text("Coupons (")', 'main button:has-text("Loyalty rewards")'],
  "/inventory-control": ['main button:has-text("Low stock")', 'main button:has-text("Damaged")', 'main button:has-text("Adjust stock")'],
  "/reports": ['main input[type="date"]', "main section", "main table"],
  "/accounting": ['main input[type="month"]', 'main button:has-text("Profit & Loss")', 'main button:has-text("Cash Book")', 'main h2:has-text("Expenses")'],
  "/barcodes": ['main input[placeholder="Article or scan code"]', 'main button:has-text("A4 sheet")', 'main button:has-text("Preview labels")'],
  "/settings": ['main h2:has-text("Store details")', 'main h2:has-text("Bill printing")', 'main h2:has-text("Team")', 'main h2:has-text("Reset store data")'],
  "/community": ['main button:has-text("7 days")', 'main h3:has-text("Poster for any stock")', 'main button:has-text("WhatsApp")'],
  "/stock-ledger": ['main table', "main section", "main h1"],
};