type SeriesProject = {
  id: string;
  parent_project_id?: string | null;
  created_at: string;
};

export function buildSeriesPath<T extends SeriesProject>(projects: T[], currentProjectId: string) {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const current = byId.get(currentProjectId);
  if (!current) return [];

  const seen = new Set([current.id]);
  const ancestors: T[] = [current];
  let cursor = current;
  while (cursor.parent_project_id) {
    const parent = byId.get(cursor.parent_project_id);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    ancestors.unshift(parent);
    cursor = parent;
  }

  const descendants: T[] = [];
  cursor = current;
  while (true) {
    const child = projects
      .filter((project) => project.parent_project_id === cursor.id && !seen.has(project.id))
      .toSorted((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0];
    if (!child) break;
    seen.add(child.id);
    descendants.push(child);
    cursor = child;
  }

  return [...ancestors, ...descendants];
}
