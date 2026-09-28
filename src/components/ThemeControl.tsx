import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme, type ThemeMode } from "@/components/ThemeProvider";

const options: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeControl({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useTheme();
  if (compact) {
    const index = options.findIndex((item) => item.value === mode);
    const next = options[(index + 1) % options.length] ?? { value: "light" as const, label: "Light", icon: Sun };
    const current = options[index] ?? { value: "system" as const, label: "System", icon: Monitor };
    const Icon = current.icon;
    return <Button variant="ghost" size="icon" onClick={() => setMode(next.value)} title={`Theme: ${current.label}`} aria-label={`Theme: ${current.label}`}><Icon className="h-4 w-4" /></Button>;
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map(({ value, label, icon: Icon }) => (
        <Button key={value} type="button" variant={mode === value ? "default" : "outline"} onClick={() => setMode(value)} className="h-11">
          <Icon className="h-4 w-4" /> {label}
        </Button>
      ))}
    </div>
  );
}