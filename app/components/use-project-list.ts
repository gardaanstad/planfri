"use client";
import { useMemo } from "react";
import {
  matchesCategories,
  projectAddedAt,
  projectInBounds,
  type Bounds,
  type Project,
} from "../lib/data";
import type { ProjectActivity } from "../lib/community";
import { inPlace as placeHas, projectPlaces } from "../lib/places";
import { searchText } from "../lib/project-filters";

/**
 * The explorer's projects through its filters: those on the map, and those
 * in the list, sorted. Each step is memoized on its own inputs, so moving the
 * map re-sorts the list without redrawing the map, and the reverse.
 */
export function useProjectList({
  projects,
  activity,
  query,
  status,
  category,
  sort,
  selectedId,
  bounds,
  place,
  nearby = "",
}: {
  projects: Project[];
  activity: Record<string, ProjectActivity>;
  query: string;
  status: string[];
  category: string[];
  sort: string;
  /** An open project stays on the map even when the filters leave it out. */
  selectedId: string | null;
  /** The list's area: the map's view, or null for Norway or `place`. */
  bounds: Bounds | null;
  /** The list's place filter, when it isn't the map's view. */
  place: string;
  /** Beside the map, the place its view is on: its projects out of view
   * follow the list's, muted. */
  nearby?: string;
}) {
  const placesOf = useMemo(
    () =>
      new Map(
        projects.map((project) => [
          project.id,
          projectPlaces(project.city, project.center),
        ]),
      ),
    [projects],
  );
  // The map gets every match in Norway, unsorted, so re-ranking never redraws it.
  const matching = useMemo(
    () =>
      projects.filter(
        (project) =>
          (status.length === 0 || status.includes(project.status)) &&
          matchesCategories(project.categories, category),
      ),
    [category, projects, status],
  );
  const mapProjects = useMemo(() => {
    const open = projects.find((project) => project.id === selectedId);
    return open && !matching.includes(open) ? [...matching, open] : matching;
  }, [matching, projects, selectedId]);
  const needle = query.trim().toLocaleLowerCase("nb");
  // Search narrows the list, not the map; it can find places outside the view.
  const searchHits = useMemo(
    () =>
      needle
        ? matching.filter((project) => searchText(project).includes(needle))
        : matching,
    [matching, needle],
  );
  const [listed, offMap] = useMemo(() => {
    const inPlace = (project: Project) =>
      bounds
        ? projectInBounds(project, bounds)
        : !place || placeHas(placesOf.get(project.id), place);
    // "Aktuelt" ranks by discussion over the past week, then by latest update.
    const compare = (a: Project, b: Project) =>
      sort === "title"
        ? a.title.localeCompare(b.title, "nb")
        : sort === "added"
          ? projectAddedAt(b).localeCompare(projectAddedAt(a))
          : (activity[b.id]?.recent ?? 0) - (activity[a.id]?.recent ?? 0) ||
            b.updated.localeCompare(a.updated);
    const shown: Project[] = [];
    const rest: Project[] = [];
    for (const project of searchHits) {
      if (inPlace(project)) shown.push(project);
      else if (bounds && nearby && placeHas(placesOf.get(project.id), nearby))
        rest.push(project);
    }
    return [shown.sort(compare), rest.sort(compare)];
  }, [activity, bounds, nearby, place, placesOf, searchHits, sort]);
  return {
    placesOf,
    matching,
    mapProjects,
    needle,
    searchHits,
    listed,
    /** Matches in `nearby` that the map's view leaves out, sorted alike. */
    offMap,
    /** Matches, or search hits, the map's view leaves out of the list. */
    outsideHits: bounds ? searchHits.length - listed.length : 0,
  };
}
