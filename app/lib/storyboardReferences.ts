export function continuityReferenceImage(currentIds: string[], previousIds: string[], sceneContinues: boolean, image?: string) {
  if (!image) return undefined;
  const previous = new Set(previousIds);
  const sharesCharacter = currentIds.some((id) => previous.has(id));
  return sharesCharacter || sceneContinues ? image : undefined;
}
