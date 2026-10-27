import {
  LayoutDashboard, ScanBarcode, Package, Ticket, Truck, Receipt, Factory, Users, Paintbrush,
  ShieldAlert, Megaphone, BarChart3, Calculator, Barcode, Settings, ScrollText, BookText, CalendarCheck,
  type LucideIcon,
} from "lucide-react";

export type ModuleDef = {
  to: string;
  label: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
  phase?: string;
};

// SoleStack modules. Inventory Matrix removed on owner request (size stock lives in Products).
export const MODULES: ModuleDef[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/pos", label: "POS Billing", icon: ScanBarcode, },
  { to: "/products", label: "Products", icon: Package },
  { to: "/purchase", label: "Purchase", icon: Truck, ownerOnly: true },
  { to: "/sales", label: "Sales History", icon: Receipt },
  { to: "/suppliers", label: "Suppliers", icon: Factory, ownerOnly: true },
  { to: "/customers", label: "Customers", icon: Users, },
  { to: "/khata", label: "Khatabook", icon: BookText },
  { to: "/bookings", label: "Online Orders", icon: CalendarCheck },
  { to: "/coupons", label: "Rewards & Coupons", icon: Ticket },
  { to: "/inventory-control", label: "Inventory Control", icon: ShieldAlert, ownerOnly: true },
  { to: "/reports", label: "Reports", icon: BarChart3, ownerOnly: true },
  { to: "/accounting", label: "Accounting", icon: Calculator, ownerOnly: true },
  { to: "/barcodes", label: "Barcodes", icon: Barcode },
  { to: "/settings", label: "Settings", icon: Settings, ownerOnly: true },
  { to: "/community", label: "WhatsApp & Posters", icon: Megaphone },
  { to: "/stock-ledger", label: "Stock Ledger", icon: ScrollText },
  { to: "/catalog-studio", label: "Catalog Studio", icon: Paintbrush, ownerOnly: true },
];

export const inr = (n: number | null | undefined) =>
  "₹" + Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
