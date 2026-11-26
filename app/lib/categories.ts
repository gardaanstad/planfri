/**
 * Project categories: main categories, each with subcategories. A project
 * holds a main category on its own, or narrowed to one or more of its
 * subcategories. Names are unique across the tree, so a name alone says
 * where it belongs, and names are what projects, suggestions and links
 * store.
 *
 * Changing them is a matter of this file:
 *
 * - **Adding** a category: add its name to the tree. The filter, the
 *   project editor, validation and links pick it up. An icon is optional
 *   (`category-icon.tsx`); without one it takes its main's.
 * - **Renaming, merging or moving** one: change the tree, then list the old
 *   name in `retiredCategories` with what it became. Stored projects,
 *   suggestions and old links read as the new names at once; the next save
 *   stores them. A migration can rewrite the stored names too, after which
 *   the entry may go.
 */
export const categoryTree = [
  {
    name: "Samferdsel",
    subcategories: [
      "Vei",
      "Jernbane",
      "T-bane",
      "Sporvei",
      "Kollektiv",
      "Sykkel og gange",
      "Havn",
      "Luftfart",
    ],
  },
  {
    name: "Byutvikling",
    subcategories: [
      "Bolig",
      "Næring",
      "Byrom og park",
      "Skole",
      "Helse",
      "Kultur og idrett",
      "Forvaltning",
    ],
  },
  {
    name: "Annen infrastruktur",
    subcategories: [
      "Kraftproduksjon",
      "Strømnett",
      "Fjernvarme",
      "CO₂-lagring",
      "Drikkevann",
      "Avløp",
      "Overvann",
    ],
  },
] as const;

/**
 * Names no longer in the tree, and the names they read as now. Energi and
 * Vann og avløp became Annen infrastruktur, Offentlige bygg part of
 * Byutvikling (migration `0011_category_merge`); their subcategories kept
 * their names.
 */
export const retiredCategories: Record<string, readonly Category[]> = {
  Energi: ["Annen infrastruktur"],
  "Vann og avløp": ["Annen infrastruktur"],
  "Offentlige bygg": ["Byutvikling"],
};

type CategoryNode = (typeof categoryTree)[number];
export type MainCategory = CategoryNode["name"];
export type Subcategory = CategoryNode["subcategories"][number];
export type Category = MainCategory | Subcategory;
export const mainCategories: MainCategory[] = categoryTree.map(
  (node) => node.name,
);
/** Every category in display order: each main followed by its subcategories. */
export const categories: Category[] = categoryTree.flatMap((node) => [
  node.name,
  ...node.subcategories,
]);
const parents = new Map<string, MainCategory>(
  categoryTree.flatMap((node) => [
    [node.name, node.name] as const,
    ...node.subcategories.map((sub) => [sub, node.name] as const),
  ]),
);
export const isCategory = (value: string): value is Category =>
  parents.has(value);
/** The main category a category belongs to; a main is its own. */
export const mainCategoryOf = (category: Category) => parents.get(category)!;
export const isMainCategory = (category: string): category is MainCategory =>
  parents.get(category) === category;
/**
 * Known categories, retired names read as their replacements, each with its
 * main, deduplicated, in tree order.
 */
export function normalizeCategories(values: readonly string[]): Category[] {
  const known = values
    .flatMap((value) => retiredCategories[value] ?? [value])
    .filter(isCategory);
  const kept = new Set<string>([...known, ...known.map(mainCategoryOf)]);
  return categories.filter((category) => kept.has(category));
}
/** Any value a category may have been stored or linked as, retired or not. */
export const isCategoryName = (value: string) =>
  isCategory(value) || value in retiredCategories;
/**
 * What a set of categories reads as: per main, its chosen subcategories, or
 * the main itself when none is chosen.
 */
export function categoryLabels(values: readonly string[]): Category[] {
  const kept = normalizeCategories(values);
  return categoryTree.flatMap((node) => {
    if (!kept.includes(node.name)) return [];
    const subs = node.subcategories.filter((sub) => kept.includes(sub));
    return subs.length ? subs : [node.name];
  });
}
/**
 * Whether a project's categories meet a filter: any chosen main, narrowed to
 * its chosen subcategories when it has some. No filter matches everything.
 */
export function matchesCategories(
  project: readonly Category[],
  filter: readonly string[],
) {
  const chosen = normalizeCategories(filter);
  if (!chosen.length) return true;
  return categoryTree.some((node) => {
    if (!chosen.includes(node.name)) return false;
    const subs = node.subcategories.filter((sub) => chosen.includes(sub));
    return subs.length
      ? subs.some((sub) => project.includes(sub))
      : project.some((category) => mainCategoryOf(category) === node.name);
  });
}

/** Rail (railway, metro and tram) and road lines are drawn and labelled by their mode. */
export type TransportMode = "rail" | "road";
/** Railway, metro and tram, each drawn as a railway. */
export const railCategories = ["Jernbane", "T-bane", "Sporvei"] as const;
export function transportMode(
  categories: readonly string[],
): TransportMode | null {
  if (railCategories.some((category) => categories.includes(category)))
    return "rail";
  if (categories.includes("Vei")) return "road";
  return null;
}
