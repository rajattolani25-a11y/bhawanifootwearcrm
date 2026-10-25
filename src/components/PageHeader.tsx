import styles from "./premium.module.css";
import type { ReactNode } from "react";
import { useLang } from "@/lib/i18n";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  const { t } = useLang();
  return (
    <div className={`${styles["pageHeader"]} mb-5 flex min-w-0 flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-end md:mb-6`}>
      <div className="min-w-0 flex-1">
        <h1 className="break-words text-2xl font-bold md:text-3xl">{t(title)}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{t(subtitle)}</p>}
      </div>
      {actions && <div className="flex min-w-0 max-w-full flex-wrap gap-2 [&>div]:flex-wrap">{actions}</div>}
    </div>
  );
}

export function ComingSoon({ title, phase, points }: { title: string; phase: string; points: string[] }) {
  return (
    <div>
      <PageHeader title={title} subtitle={`Being rebuilt on the cloud — arrives in ${phase}.`} />
      <div className="max-w-xl rounded-xl border bg-card p-6">
        <p className="text-sm font-medium text-muted-foreground">What this screen will do</p>
        <ul className="mt-3 space-y-2 text-sm">
          {points.map((p) => (
            <li key={p} className="flex gap-2"><span className="text-success">•</span>{p}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
