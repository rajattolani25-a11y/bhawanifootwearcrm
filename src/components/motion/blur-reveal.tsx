// Adapted from Magic UI's MIT BlurFade: viewport-once reveal, no blur filter
// or hidden SSR content; touch/keyboard actions remain usable immediately.
import { m, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
export function BlurReveal({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const reduce = useReducedMotion();
  return <m.div initial={false} whileInView={enabled && !reduce ? { y: [8, 0], opacity: [.85, 1] } : { y: 0, opacity: 1 }}
    viewport={{ once: true, amount: .15 }} transition={{ duration: .35 }}>{children}</m.div>;
}
