// Controlled adaptation of Motion Primitives' AnimatedBackground.
// MIT, ibelick/motion-primitives. See docs/ui-motion-notices.md.
import { m, useReducedMotion } from "motion/react";
import { useId } from "react";
export function AnimatedTabs<T extends string>({ value, options, onChange, label }: {
  value: T; options: readonly T[]; onChange: (value: T) => void; label: (value: T) => string;
}) {
  const id = useId(), reduce = useReducedMotion();
  return <div className="mb-4 flex max-w-full gap-1 overflow-x-auto rounded-xl border bg-muted/50 p-1" role="group" aria-label="Report view">
    {options.map(option => <button type="button" key={option} aria-pressed={value === option} onClick={() => onChange(option)}
      className="relative isolate shrink-0 rounded-lg px-3 py-2.5 text-sm font-medium outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary">
      {value === option && <m.span aria-hidden="true" {...(reduce ? {} : { layoutId: `tab-${id}` })} initial={false}
        className="absolute inset-0 -z-10 rounded-lg border bg-card shadow-sm" transition={{ duration: reduce ? 0 : .18 }} />}
      <span className={value === option ? "text-foreground" : "text-muted-foreground"}>{label(option)}</span>
    </button>)}
  </div>;
}
