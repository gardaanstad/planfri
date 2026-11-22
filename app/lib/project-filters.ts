import {
  categoryLabels,
  isMainCategory,
  mainCategoryOf,
  statuses,
  statusOrder,
  type Category,
  type Point,
  type Project,
} from "./data";

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
/**
 * The filter without one of its labels: a main goes with its subcategories,
 * and the last subcategory of a main takes the main along.
 */
export function withoutCategory(values: string[], label: Category) {
  const main = mainCategoryOf(label);
  const siblings = values.filter(
    (value) => value !== main && mainCategoryOf(value as Category) === main,
  );
  const removeMain = isMainCategory(label) || siblings.length <= 1;
  return values.filter(
    (value) =>
      value !== label &&
      !(removeMain && mainCategoryOf(value as Category) === main),
  );
}
export function statusSummary(values: string[]) {
  const labels = statusOrder
    .filter((value) => values.includes(value))
    .map((value, i) =>
      i === 0 ? statuses[value].label : statuses[value].label.toLowerCase(),
    );
  if (labels.length === 0 || labels.length === 3) return "Alle statuser";
  return labels.join(", ");
}
/** What a search matches a project on, lowercased. */
export const searchText = (project: Project) =>
  `${project.title} ${project.city} ${project.district} ${project.categories.join(" ")} ${project.developer}`.toLocaleLowerCase(
    "nb",
  );
/** The points that frame a project on the map. */
export const projectPoints = (project: Project): Point[] =>
  project.geometry.length ? project.geometry : [project.center];
