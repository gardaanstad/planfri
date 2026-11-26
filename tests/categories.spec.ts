import { expect, test } from "@playwright/test";
import {
  categories,
  categoryTree,
  normalizeCategories,
  retiredCategories,
} from "../app/lib/categories";
import { projectFields } from "../app/lib/community-rules";
import { parseExploreState } from "../app/lib/explore-state";

test("names are unique across the tree", () => {
  expect(new Set(categories).size).toBe(categories.length);
  // A retired name is never a live one.
  for (const name of Object.keys(retiredCategories))
    expect(categories).not.toContain(name);
});

test("three main categories, public buildings under Byutvikling", () => {
  expect(categoryTree.map((node) => node.name)).toEqual([
    "Samferdsel",
    "Byutvikling",
    "Annen infrastruktur",
  ]);
  expect(normalizeCategories(["Helse"])).toEqual(["Byutvikling", "Helse"]);
  expect(normalizeCategories(["Strømnett", "Drikkevann"])).toEqual([
    "Annen infrastruktur",
    "Strømnett",
    "Drikkevann",
  ]);
});

test("retired names read as what they became", () => {
  expect(normalizeCategories(["Offentlige bygg", "Skole"])).toEqual([
    "Byutvikling",
    "Skole",
  ]);
  expect(normalizeCategories(["Energi", "Vann og avløp", "Avløp"])).toEqual([
    "Annen infrastruktur",
    "Avløp",
  ]);
  // Old links filter by the new names.
  expect(
    parseExploreState(new URLSearchParams("kategori=Energi,Offentlige%20bygg"))
      .category,
  ).toEqual(["Byutvikling", "Annen infrastruktur"]);
  // Saving with an old name stores the new one; unknown names are refused.
  const fields = projectFields.shape.categories;
  expect(fields.parse(["Vann og avløp", "Overvann"])).toEqual([
    "Annen infrastruktur",
    "Overvann",
  ]);
  expect(fields.safeParse(["Romfart"]).success).toBe(false);
});
