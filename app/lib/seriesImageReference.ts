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
