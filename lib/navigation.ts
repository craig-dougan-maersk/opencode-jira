export function pushScreen<T>(stack: readonly T[], screen: T): readonly T[] {
  return [...stack, screen];
}
export function popScreen<T>(
  stack: readonly T[],
): readonly [readonly T[], T | undefined] {
  return [stack.slice(0, -1), stack.at(-1)];
}
export function columnWindow(
  available: number,
  columns: number,
  selected: number,
) {
  const width = Math.max(1, available);
  const count = Math.max(
    1,
    Math.min(columns, Math.floor((width + 1) / 29) || 1),
  );
  const start = Math.max(0, Math.min(selected, columns - count));
  return {
    start,
    count,
    width: Math.max(1, Math.floor((width - count + 1) / count)),
  };
}
export type FocusRegion =
  | "tabs"
  | "content"
  | "body"
  | "relationships"
  | "back"
  | "comment"
  | "details";
export const ROOT_VIEWS = ["mine", "sprint", "backlog", "epics"] as const;
