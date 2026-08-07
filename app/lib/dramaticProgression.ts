export function normalizeDramaticFunction(value: string) {
  return String(value ?? "").trim().toLocaleLowerCase("zh-CN").replace(/[\s，。；：、,.!！?？"“”'‘’（）()\-—]/g, "");
}

export function dramaticFunctionSimilarity(left: string, right: string) {
  const a = normalizeDramaticFunction(left);
  const b = normalizeDramaticFunction(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (value: string) => {
    const result = new Set<string>();
    for (let index = 0; index < value.length - 1; index++) result.add(value.slice(index, index + 2));
    return result;
  };
  const leftGrams = grams(a);
  const rightGrams = grams(b);
  if (!leftGrams.size || !rightGrams.size) return 0;
  let shared = 0;
  for (const gram of leftGrams) if (rightGrams.has(gram)) shared++;
  return (2 * shared) / (leftGrams.size + rightGrams.size);
}

export function redundantDramaticFunctionIndex(values: string[], candidateIndex: number, threshold = 0.65) {
  const candidate = values[candidateIndex];
  for (let index = 0; index < candidateIndex; index++) {
    if (dramaticFunctionSimilarity(values[index], candidate) >= threshold) return index;
  }
  return -1;
}

export function hasDistinctDramaticFunctions(values: string[], minimumLength = 15) {
  const trimmed = values.map((value) => String(value ?? "").trim());
  const normalized = trimmed.map(normalizeDramaticFunction);
  return trimmed.every((value) => value.length >= minimumLength)
    && normalized.every(Boolean)
    && values.every((_, index) => redundantDramaticFunctionIndex(values, index) < 0);
}
