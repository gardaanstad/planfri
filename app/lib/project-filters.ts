import { categoryLabels, type Point, type Project } from "./data";

// Under "Vis flere" in the category filter.
export const lessUsedCategories = new Set<string>([
  "Energi",
  "Vann og avløp",
  "Offentlige bygg",
]);

export function categorySummary(values: string[]) {
  const labels = categoryLabels(values);
  return labels.length === 0
    ? "Alle kategorier"
    : labels.length === 1
      ? labels[0]
      : `${labels.length} kategorier`;
}
/** What a search matches a project on, lowercased. */
export const searchText = (project: Project) =>
  `${project.title} ${project.city} ${project.district} ${project.categories.join(" ")} ${project.developer}`.toLocaleLowerCase(
    "nb",
  );
/** The points that frame a project on the map. */
export const projectPoints = (project: Project): Point[] =>
  project.geometry.length ? project.geometry : [project.center];
