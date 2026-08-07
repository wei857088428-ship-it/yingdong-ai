type ImageReferenceShot = {
  shot_number: number;
  image_url?: string;
};

type ImageReferenceProject<TShot extends ImageReferenceShot> = {
  id: string;
  parent_project_id?: string | null;
  storyboard_shots: TShot[];
};

export function parentClosingImageShot<TShot extends ImageReferenceShot>(projects: Array<ImageReferenceProject<TShot>>, currentProjectId: string) {
  const current = projects.find((project) => project.id === currentProjectId);
  if (!current?.parent_project_id) return undefined;
  const parent = projects.find((project) => project.id === current.parent_project_id);
  return parent?.storyboard_shots
    .filter((shot) => Boolean(shot.image_url))
    .toSorted((a, b) => b.shot_number - a.shot_number)[0];
}

export function seriesOpeningImageShot<TShot extends ImageReferenceShot>(projects: Array<ImageReferenceProject<TShot>>, currentProjectId: string) {
  let current = projects.find((project) => project.id === currentProjectId);
  if (!current?.parent_project_id) return undefined;
  const visited = new Set([current.id]);
  let oldestAncestorWithImage: ImageReferenceProject<TShot> | undefined;
  while (current?.parent_project_id && !visited.has(current.parent_project_id)) {
    visited.add(current.parent_project_id);
    const parent = projects.find((project) => project.id === current?.parent_project_id);
    if (!parent) break;
    if (parent.storyboard_shots.some((shot) => Boolean(shot.image_url))) oldestAncestorWithImage = parent;
    current = parent;
  }
  return oldestAncestorWithImage?.storyboard_shots
    .filter((shot) => Boolean(shot.image_url))
    .toSorted((a, b) => a.shot_number - b.shot_number)[0];
}
