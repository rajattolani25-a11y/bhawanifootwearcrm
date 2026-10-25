import { LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";
const loadFeatures = () => import("./features").then(m => m.default);
export function InterfaceMotion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user" transition={{ duration: .18, ease: "easeOut" }}><LazyMotion features={loadFeatures}>{children}</LazyMotion></MotionConfig>;
}
