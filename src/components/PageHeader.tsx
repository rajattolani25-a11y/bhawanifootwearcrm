import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
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
