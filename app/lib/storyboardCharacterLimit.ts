export const MAX_IDENTITY_REFERENCES = 3;

export function uniqueCharacterCount(names: string[]) {
  return new Set(names.map((name) => name.trim().toLocaleLowerCase("zh-CN")).filter(Boolean)).size;
}
