import {
  LayoutDashboard, ScanBarcode, Package, Grid3x3, Truck, Receipt, Factory, Users,
  ShieldAlert, Megaphone, BarChart3, Calculator, Barcode, Settings, ScrollText,
  type LucideIcon,
} from "lucide-react";

export type ModuleDef = {
  to: string;
  label: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
  phase?: string;
};

// All 14 original SoleStack modules, same order as the old app.
export const MODULES: ModuleDef[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/pos", label: "POS Billing", icon: ScanBarcode, },
  { to: "/products", label: "Products", icon: Package },
  { to: "/inventory", label: "Inventory Matrix", icon: Grid3x3 },
  { to: "/purchase", label: "Purchase", icon: Truck, ownerOnly: true },
  { to: "/sales", label: "Sales History", icon: Receipt },
  { to: "/suppliers", label: "Suppliers", icon: Factory, ownerOnly: true },
  { to: "/customers", label: "Customers", icon: Users, },
  { to: "/inventory-control", label: "Inventory Control", icon: ShieldAlert, ownerOnly: true },
  { to: "/reports", label: "Reports", icon: BarChart3, ownerOnly: true },
  { to: "/accounting", label: "Accounting", icon: Calculator, ownerOnly: true },
  { to: "/barcodes", label: "Barcodes", icon: Barcode },
  { to: "/settings", label: "Settings", icon: Settings, ownerOnly: true },
  { to: "/community", label: "WhatsApp & Posters", icon: Megaphone },
  { to: "/stock-ledger", label: "Stock Ledger", icon: ScrollText },
];

export const inr = (n: number | null | undefined) =>
  "₹" + Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
