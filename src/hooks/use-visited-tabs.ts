import { useCallback, useState } from "react";

/** Load an editor on first use, then retain it so changing tabs never discards its draft. */
export function useVisitedTabs(initial: string) {
  const [state, setState] = useState(() => ({ active: initial, visited: new Set([initial]) }));
  const select = useCallback((active: string) => {
    setState((previous) =>
      previous.active === active
        ? previous
        : {
            active,
            visited: previous.visited.has(active)
              ? previous.visited
              : new Set([...previous.visited, active]),
          },
    );
  }, []);
  return [state.active, select, state.visited] as const;
}
