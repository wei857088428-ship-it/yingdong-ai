export function castAssignmentChanged(current: string[] | null | undefined, next: string[] | null | undefined) {
  if (current == null || next == null) return current !== next;
  const normalize = (ids: string[]) => [...new Set(ids.filter(Boolean))].toSorted();
  const left = normalize(current);
  const right = normalize(next);
  return left.length !== right.length || left.some((id, index) => id !== right[index]);
}
