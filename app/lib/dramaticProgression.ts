export function normalizeDramaticFunction(value: string) {
  return String(value ?? "").trim().toLocaleLowerCase("zh-CN").replace(/[\s，。；：、,.!！?？"“”'‘’（）()\-—]/g, "");
}

export function hasDistinctDramaticFunctions(values: string[], minimumLength = 15) {
  const trimmed = values.map((value) => String(value ?? "").trim());
  const normalized = trimmed.map(normalizeDramaticFunction);
  return trimmed.every((value) => value.length >= minimumLength) && normalized.every(Boolean) && new Set(normalized).size === normalized.length;
}
