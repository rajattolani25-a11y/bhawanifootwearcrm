import type { ComponentProps } from "react";
import { TabsContent } from "./ui/tabs";

/** A visited panel stays mounted, including while hidden and while an action is pending. */
export function VisitedTabsContent({
  visited,
  children,
  ...props
}: ComponentProps<typeof TabsContent> & { visited: boolean }) {
  return (
    <TabsContent {...props} forceMount>
      {visited ? children : null}
    </TabsContent>
  );
}
