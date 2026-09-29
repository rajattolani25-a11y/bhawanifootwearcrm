// Selectors for visible, non-destructive landmarks. text: resolves by visible label.
export const guideTargets: Record<string, string[]> = {
  "/dashboard": ["main h1", "main section:nth-of-type(2)", "main section:nth-of-type(3)"],
  "/pos": ['main input[placeholder*="Scan barcode"]', 'main input[placeholder*="mobile"]', 'main input[placeholder*="coupon"]'],
  "/products": ['main input[placeholder*="Search brand"]', 'text:Quick add', "main section"],
  "/purchase": ['main input[placeholder="Invoice no"]', 'main input[placeholder="Search article to add sizes"]', 'text:Receive stock'],
  "/sales": ['main input[placeholder="Bill no, name or mobile"]', "main table", "main table thead"],
  "/suppliers": ['main input[placeholder="Name"]', 'text:Add supplier', "main h1"],
  "/customers": ['main input[placeholder="Search mobile or name"]', 'text:Add customer', "main h1"],
  "/coupons": ['text:New coupon', 'text:Coupons (', 'text:Loyalty rewards'],
  "/inventory-control": ['text:Low stock', 'text:Damaged', 'text:Adjust stock'],
  "/reports": ['main input[type="date"]', "main section", "main h1"],
  "/accounting": ['main input[type="month"]', 'text:Profit & Loss', 'text:Expenses'],
  "/barcodes": ['main input[placeholder="Article or scan code"]', 'text:A4 sheet', 'text:Preview labels'],
  "/settings": ['text:Store details', 'text:Bill printing', 'text:Team', 'text:Reset store data'],
  "/community": ['text:7 days', 'text:Poster for any stock', 'text:WhatsApp'],
  "/stock-ledger": ["main table", "main section", "main h1"],
};
