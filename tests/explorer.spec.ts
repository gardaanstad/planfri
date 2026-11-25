import {
  devices,
  expect,
  test,
  type Locator,
  type Page,
} from "@playwright/test";
import { seedProjects } from "../scripts/seed-data";
import { getProjectUpdates } from "../app/lib/data";
import { mainCities, placeInView, projectPlaces } from "../app/lib/places";
import {
  accountMenuItem,
  member,
  mutation,
  openOwnProfile,
  openSaved,
  middleOf,
  shot,
  signIn,
  swipeDown,
  touchMove,
  uniqueName,
} from "./support";

const project = seedProjects[0];
const projectPath = `/prosjekt/${project.id}`;
// Explorer URLs carry the filters and map position as a query string.
const atProject = new RegExp(`${projectPath}(\\?|$)`);
const atList = /:\d+\/(\?|$)/;

/** The explorer's drawer folded down to its filters. */
const compact = "compact";

async function expectDrawerHeight(
  page: Page,
  fraction: number | typeof compact,
  drawer: "explorer" | "project" | "saved" = "explorer",
) {
  if (fraction === compact)
    fraction = 136 / (await page.evaluate(() => window.innerHeight));
  // Panels other than projects are drawers named by `data-panel-drawer`.
  const selector =
    drawer === "saved"
      ? `[data-panel-drawer="${drawer}"]`
      : `[data-${drawer}-drawer]`;
  await expect
    .poll(() =>
      page.locator(selector).evaluate((element) => {
        return (
          (window.innerHeight - element.getBoundingClientRect().top) /
          window.innerHeight
        );
      }),
    )
    .toBeCloseTo(fraction, 1);
}

/** Folds the list down from the middle height it opens at. */
async function foldList(page: Page) {
  await expectDrawerHeight(page, 0.58);
  await swipeDown(
    page,
    page.getByRole("button", { name: "Utvid prosjektlisten", exact: true }),
  );
  await expectDrawerHeight(page, compact);
}

/** Each project lies in the box: as its shape, its dot, or its group. */
async function expectMembersIn(
  page: Page,
  ids: string[],
  box: { left: number; top: number; right: number; bottom: number },
) {
  await expect
    .poll(() =>
      page.evaluate(
        ({ ids, box }) =>
          ids.filter((id) => {
            const element = [
              `path[data-project-id="${id}"]`,
              `path[data-project-dot="${id}"]`,
              `.project-cluster[data-cluster~="${id}"]`,
            ]
              .map((selector) => document.querySelector(selector))
              .find(
                (candidate) =>
                  candidate && getComputedStyle(candidate).display !== "none",
              );
            if (!element) return true;
            const rect = element.getBoundingClientRect();
            return (
              rect.left < box.left ||
              rect.top < box.top ||
              rect.right > box.right ||
              rect.bottom > box.bottom
            );
          }),
        { ids, box },
      ),
    )
    .toEqual([]);
}

// Desktop: the filter popover, open on one of its sections.
async function openFilter(page: Page, section: "Kategori" | "Status") {
  await page
    .getByRole("region", { name: "Filtrer prosjekter", exact: true })
    .getByRole("button", { name: "Filtre", exact: true })
    .click();
  const popover = page.locator("[data-filter-popover]");
  await expect(popover).toBeVisible();
  const row = popover.getByRole("button", { name: new RegExp(`^${section}`) });
  if ((await row.getAttribute("aria-expanded")) !== "true") await row.click();
  return popover.getByRole("listbox", {
    name: section === "Status" ? "Prosjektstatus" : "Kategori",
    exact: true,
  });
}

async function expectMenuFits(menu: Locator) {
  await expect(menu).toBeVisible();
  await expect
    .poll(() =>
      menu.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.left >= 0 &&
          rect.right <= window.innerWidth &&
          rect.top >= 0 &&
          rect.bottom <= window.innerHeight
        );
      }),
    )
    .toBe(true);
}

/** Drags a finger up from near the bottom of `target`, at most 320px. */
async function swipeUp(page: Page, target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error("Swipe target is not visible");
  const x = box.x + box.width / 2;
  const y = Math.min(box.y + box.height - 20, page.viewportSize()!.height - 60);
  await touchMove(page, { x, y }, { x, y: y - Math.min(320, y - 40) });
}

/** Drags a finger `dy` pixels from the middle of `target`. */
async function drag(
  page: Page,
  target: Locator,
  dy: number,
  options: Parameters<typeof touchMove>[3] = {},
) {
  const from = await middleOf(target);
  await touchMove(page, from, { x: from.x, y: from.y + dy }, { steps: 12, ...options });
}

// The smallest phone: narrow and short, so overflow and drawer heights bite.
const viewport = { width: 320, height: 568 };

test.describe(`mobile explorer at ${viewport.width}px`, () => {
  // A phone's user agent, so the server renders the mobile layout first.
  test.use({
    viewport,
    isMobile: true,
    hasTouch: true,
    userAgent: devices["Pixel 7"].userAgent,
  });

  test("a tap beside an alignment still opens it", async ({ page }) => {
    await page.goto("/?kart=59.1200,5.5000,8");
    await foldList(page);
    const line = page.locator('path[data-project-id="rogfast"]');
    await expect(line).toBeVisible();
    // A point midway along the line, and the way across it there.
    const { x, y, nx, ny } = await line.evaluate((element) => {
      const path = element as SVGPathElement;
      const matrix = path.getScreenCTM()!;
      const screen = (length: number) =>
        new DOMPoint(
          path.getPointAtLength(length).x,
          path.getPointAtLength(length).y,
        ).matrixTransform(matrix);
      const middle = path.getTotalLength() / 2;
      const at = screen(middle);
      const ahead = screen(middle + 1);
      const length = Math.hypot(ahead.x - at.x, ahead.y - at.y);
      return {
        x: at.x,
        y: at.y,
        nx: -(ahead.y - at.y) / length,
        ny: (ahead.x - at.x) / length,
      };
    });
    // Well off the drawn line, inside the band around it.
    await page.touchscreen.tap(x + nx * 22, y + ny * 22);
    await expect(page).toHaveURL(/\/prosjekt\/rogfast\?/);
  });

  test("projects open in their own drawer over the map and preserve map, history, and reading space", async ({
    page,
  }) => {
    // The list opens at the middle height, and unfolds to full height.
    await page.goto("/");
    await expectDrawerHeight(page, 0.58);
    const expand = page.getByRole("button", {
      name: "Utvid prosjektlisten",
      exact: true,
    });
    await expand.click();
    await expectDrawerHeight(page, 1);
    await expect(
      page.getByRole("region", { name: "Prosjektliste", exact: true }),
    ).toBeVisible();
    const result = page
      .getByRole("region", { name: "Prosjektliste", exact: true })
      .getByRole("button", { name: new RegExp(project.title) })
      .first();
    const projectDrawer = page.locator("[data-project-drawer]");
    await result.click();
    await expect(page).toHaveURL(atProject);
    // A project opened from the list rests at the middle height over the
    // map, centered on it, with the list come down behind it.
    await expectDrawerHeight(page, 0.58, "project");
    await expectDrawerHeight(page, 0.58);
    await expect(page.locator("[data-map-controls]")).toBeVisible();
    await expect(
      page.locator(`path[data-project-id="${project.id}"]`),
    ).toBeInViewport();
    await expect(projectDrawer.locator("[data-project-post]")).toBeVisible();
    await page
      .getByRole("button", { name: "Lukk prosjekt", exact: true })
      .click();
    await expect(page).toHaveURL(atList);
    await expect(projectDrawer).toBeHidden();
    // Closed, it takes the list back to full height, focus on its card.
    await expectDrawerHeight(page, 1);
    await expect(result).toBeFocused();
    await result.click();
    await page.goBack();
    await expect(projectDrawer).toBeHidden();
    await expectDrawerHeight(page, 1);
    await page.goForward();
    await expectDrawerHeight(page, 0.58, "project");
    await page.reload();
    await expectDrawerHeight(page, 1, "project");
    // From the folded list, over the project on the map.
    await page.goto("/?kart=59.9100,10.7500,13");
    await expect(projectDrawer).toBeHidden();
    await foldList(page);
    // Until the map regroups at its new zoom, the shape can be hidden in a
    // group, and a key pressed on it would go elsewhere.
    const shape = page.locator(`[data-project-id="${project.id}"]`);
    await expect(shape).toBeVisible();
    await shape.press("Enter");
    await expect(page).toHaveURL(atProject);
    // Opened from the map, it rests at the middle height over it, and the
    // folded list stays folded behind it.
    await expectDrawerHeight(page, 0.58, "project");
    await expectDrawerHeight(page, compact);
    // Swiping the project away goes back to the folded list.
    // By its grip: the map controls ride above it.
    await swipeDown(page, projectDrawer.locator(":scope > [aria-hidden]"));
    await expect(page).toHaveURL(atList);
    await expect(projectDrawer).toBeHidden();
    await expectDrawerHeight(page, compact);
    // Folded, it stays at its top rather than scrolling to the project.
    await page.waitForTimeout(100);
    expect(
      await page
        .locator("[data-explorer-drawer] [data-drawer-scroll]")
        .evaluate((element) => element.scrollTop),
    ).toBe(0);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
  });

  test("a photo tapped in an expanded card opens the project, not the lightbox", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Utvid prosjektlisten", exact: true })
      .click();
    await page.getByRole("button", { name: /^Visning/ }).click();
    await page.getByRole("option", { name: "Utvidet" }).click();
    const card = page
      .getByRole("region", { name: "Prosjektliste", exact: true })
      .locator("[data-card-id]")
      .filter({ has: page.getByRole("group", { name: /^Bilder av / }) })
      .first();
    const id = await card.getAttribute("data-card-id");
    await card
      .getByRole("group", { name: /^Bilder av / })
      .getByRole("button")
      .first()
      .tap();
    await expect(page).toHaveURL(new RegExp(`/prosjekt/${id}`));
    await expect(page.getByRole("dialog", { name: /^Bilder av / })).toHaveCount(0);
  });

  test("sideways drags stay on the page unless a gallery can scroll that way", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Utvid prosjektlisten", exact: true })
      .click();
    await page.getByRole("button", { name: /^Visning/ }).click();
    await page.getByRole("option", { name: "Utvidet" }).click();
    const card = page
      .getByRole("region", { name: "Prosjektliste", exact: true })
      .locator("[data-card-id]")
      .filter({ has: page.getByRole("group", { name: /^Bilder av / }) })
      .filter({ has: page.getByRole("button", { name: /^Neste/ }) })
      .first();
    const gallery = card
      .getByRole("group", { name: /^Bilder av / })
      .locator("img")
      .first();
    await expect(gallery).toBeVisible();
    // Whether the first move of a drag by (dx, dy) from the element's
    // middle is cancelled, which is when swipe navigation takes a gesture.
    const firstMoveCancelled = (target: Locator, dx: number, dy: number) =>
      target.evaluate(
        (element, [dx, dy]) => {
          const rect = element.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          const touch = (dx: number, dy: number) =>
            new Touch({
              identifier: 1,
              target: element,
              clientX: x + dx,
              clientY: y + dy,
            });
          const event = (type: string, dx: number, dy: number) =>
            new TouchEvent(type, {
              bubbles: true,
              cancelable: true,
              touches: type === "touchend" ? [] : [touch(dx, dy)],
              changedTouches: [touch(dx, dy)],
            });
          element.dispatchEvent(event("touchstart", 0, 0));
          const move = event("touchmove", dx, dy);
          element.dispatchEvent(move);
          element.dispatchEvent(event("touchend", dx, dy));
          return move.defaultPrevented;
        },
        [dx, dy],
      );
    const title = card.getByRole("heading").first();
    expect(await firstMoveCancelled(title, 12, 2)).toBe(true);
    expect(await firstMoveCancelled(title, -12, 2)).toBe(true);
    // Up and down still scroll the list.
    expect(await firstMoveCancelled(title, 2, -12)).toBe(false);
    // The gallery scrolls on to its next photo, but not back past its first.
    expect(await firstMoveCancelled(gallery, -12, 2)).toBe(false);
    expect(await firstMoveCancelled(gallery, 12, 2)).toBe(true);
  });

  test("the views are chosen from a sheet, beside the count", async ({
    page,
  }) => {
    // Zoomed in on central Oslo: the count names the view and Oslo.
    await page.goto("/?kart=59.9100,10.7500,14");
    await page
      .getByRole("button", { name: "Utvid prosjektlisten", exact: true })
      .click();
    const list = page.getByRole("region", { name: "Prosjektliste", exact: true });
    const inOslo = list.getByRole("button", {
      name: /^\d+ prosjekte?r? i Oslo$/,
    });
    await expect(inOslo).toBeVisible();
    await expect(page.getByRole("group", { name: "Visning" })).toHaveCount(0);
    const views = page.getByRole("button", { name: /^Visning/ });
    await expect(views).toHaveText("Kompakt");
    const sort = page.getByRole("button", { name: /^Sorter prosjekter:/ });

    // The count, the order and the views share one line.
    const [viewsBox, sortBox, countBox] = await Promise.all([
      views.boundingBox(),
      sort.boundingBox(),
      inOslo.boundingBox(),
    ]);
    const middle = (box: { y: number; height: number }) =>
      box.y + box.height / 2;
    expect(Math.abs(viewsBox!.y - sortBox!.y)).toBeLessThan(1);
    expect(Math.abs(middle(countBox!) - middle(sortBox!))).toBeLessThan(1);
    expect(countBox!.x + countBox!.width).toBeLessThanOrEqual(sortBox!.x);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);

    // The sheet lists the card layouts, then "Nytt".
    await expect(async () => {
      await views.click();
      await expect(
        page.getByRole("listbox", { name: "Visning", exact: true }),
      ).toBeVisible({ timeout: 1000 });
    }).toPass();
    const sheet = page.getByRole("listbox", { name: "Visning", exact: true });
    await expect(sheet.getByRole("option")).toHaveText([
      "Kompakt",
      "Utvidet",
      "Nytt",
    ]);
    await expect(sheet.getByRole("option", { name: "Kompakt" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await shot(page, "mobile-views-sheet");

    // Choosing "Nytt" closes the sheet; the order goes, the button names it.
    await sheet.getByRole("option", { name: "Nytt" }).click();
    await expect(sheet).toBeHidden();
    await expect(list.locator("[data-feed-id]").first()).toBeVisible();
    await expect(sort).toHaveCount(0);
    await expect(views).toHaveText("Nytt");
    await expect(views).toHaveAccessibleName("Visning: Nytt");
    await shot(page, "mobile-views-feed");
  });

  test("Les mer takes a project at the middle height to the full height", async ({
    page,
  }) => {
    await page.goto("/?kart=59.9100,10.7500,13");
    const shape = page.locator(`path[data-project-id="${project.id}"]`);
    await shape.dispatchEvent("pointerdown");
    await shape.dispatchEvent("click");
    await expect(page).toHaveURL(atProject);
    await expectDrawerHeight(page, 0.58, "project");
    const drawer = page.locator("[data-project-drawer]");
    await drawer.getByRole("button", { name: "Les mer", exact: true }).click();
    await expectDrawerHeight(page, 1, "project");
    // Dragged back to the middle height, the text folds as "Vis mindre" would.
    await drag(page, drawer.locator(":scope > [aria-hidden]"), 220);
    await expectDrawerHeight(page, 0.58, "project");
    await expect(
      drawer.getByRole("button", { name: "Les mer", exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  test("a project tapped on the map opens at the middle height, centered above it", async ({
    page,
  }) => {
    await page.goto("/?kart=59.9100,10.7500,13");
    const shape = page.locator(`path[data-project-id="${project.id}"]`);
    // Other tests' projects can lie on top of it, so the press is dispatched.
    await shape.dispatchEvent("pointerdown");
    await shape.dispatchEvent("click");
    await expect(page).toHaveURL(atProject);
    await expectDrawerHeight(page, 0.58, "project");
    // Centered in the map the drawer leaves open, at the same zoom.
    await expect
      .poll(() =>
        shape.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return [
            Math.round(box.x + box.width / 2 - window.innerWidth / 2),
            Math.round(box.y + box.height / 2 - (window.innerHeight * 0.42) / 2),
          ];
        }),
      )
      .toEqual([expect.closeTo(0, -1), expect.closeTo(0, -1)]);
    await expect
      .poll(() => new URL(page.url()).searchParams.get("kart"))
      .toMatch(/,13$/);
    // The map's controls stay above it; at full height they are covered.
    const controls = page.locator("[data-map-controls]");
    await expect(controls).toBeVisible();
    const drawer = page.locator("[data-project-drawer]");
    // A fade along the screen's bottom edge says the project goes on below.
    const fade = drawer.locator("[data-scroll-fade]");
    await expect
      .poll(() =>
        fade.evaluate((element) =>
          Math.abs(Math.round(window.innerHeight - element.getBoundingClientRect().bottom)),
        ),
      )
      .toBe(0);
    await shot(page, "mobile-project-fade");
    await drawer.locator("[data-project-scroll]").hover();
    await page.mouse.wheel(0, 300);
    await expectDrawerHeight(page, 1, "project");
    await expect(controls).toBeHidden();
    await expect(fade).toHaveCount(0);
    await page
      .getByRole("button", { name: "Lukk prosjekt", exact: true })
      .click();
    await expect(page).toHaveURL(atList);
    await expect(drawer).toBeHidden();
    await expectDrawerHeight(page, 0.58);
    // Back to the area it was opened from at the zoom it had.
    await expect
      .poll(() => new URL(page.url()).searchParams.get("kart"))
      .toMatch(/^59\.\d+,10\.7500,13$/);
  });

  test("a project's text keeps its lines as its drawer grows to full width", async ({
    page,
  }) => {
    await page.goto("/");
    await expectDrawerHeight(page, 0.58);
    await page
      .getByRole("region", { name: "Prosjektliste", exact: true })
      .getByRole("button", { name: new RegExp(project.title) })
      .first()
      .click();
    await expectDrawerHeight(page, 0.58, "project");
    const drawer = page.locator("[data-project-drawer]");
    // Long enough to break somewhere else 16px wider.
    await drawer
      .getByText(project.description.split("\n\n")[0], { exact: true })
      .evaluate((element) => {
        element.textContent = `${element.textContent} `.repeat(4);
        element.setAttribute("data-long-text", "");
      });
    const text = drawer.locator("[data-long-text]");
    const lines = () =>
      text.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return [...range.getClientRects()]
          .filter((rect) => rect.width > 8)
          .map((rect) => Math.round(rect.width));
      });
    const floating = await lines();
    expect(floating.length).toBeGreaterThan(2);
    const width = () =>
      drawer.evaluate((element) => element.getBoundingClientRect().width);
    const narrow = await width();
    // Sent to full height, and dragged there.
    await drawer.locator("[data-project-scroll]").hover();
    await page.mouse.wheel(0, 300);
    await expectDrawerHeight(page, 1, "project");
    await expect.poll(width).toBeGreaterThan(narrow);
    expect(await lines()).toEqual(floating);
    const top = await middleOf(drawer.getByRole("heading", { level: 1 }));
    await touchMove(page, top, { x: top.x, y: top.y + 200 });
    await expectDrawerHeight(page, 0.58, "project");
    // Floating again, it is free to fit the text anew.
    await expect(drawer.locator("[data-sheet-pinned]")).toHaveCount(0);
    expect(await lines()).toEqual(floating);
    await swipeUp(page, drawer);
    await expectDrawerHeight(page, 1, "project");
    expect(await lines()).toEqual(floating);
  });

  test("a touch on the map folds a project over it down to its header", async ({
    page,
  }) => {
    await page.goto("/?kart=59.9100,10.7500,13");
    // From the list at the middle height, which folds under the project.
    await expectDrawerHeight(page, 0.58);
    const shape = page.locator(`path[data-project-id="${project.id}"]`);
    await shape.dispatchEvent("pointerdown");
    await shape.dispatchEvent("click");
    await expect(page).toHaveURL(atProject);
    const drawer = page.locator("[data-project-drawer]");
    await expectDrawerHeight(page, 0.58, "project");
    await expectDrawerHeight(page, 0.58);
    // A finger across the map above it folds it down to its header and
    // phase timeline, labels and all, and folds the list down under it; the
    // project stays open.
    await touchMove(page, { x: 160, y: 100 }, { x: 100, y: 140 }, { steps: 10 });
    await expect(drawer).toHaveAttribute("data-snap", "folded");
    await expectDrawerHeight(page, compact);
    const phases = drawer.locator("[data-phase-strip]");
    await expect
      .poll(() =>
        phases.evaluate(
          (element) =>
            window.innerHeight - element.getBoundingClientRect().bottom,
        ),
      )
      .toBeGreaterThanOrEqual(8 + 10);
    await expect
      .poll(() =>
        drawer.evaluate(
          (element) => window.innerHeight - element.getBoundingClientRect().top,
        ),
      )
      .toBeLessThan(viewport.height * 0.45);
    await expect(drawer.locator("[data-scroll-fade]")).toHaveCount(0);
    await expect(page).toHaveURL(atProject);
    await expect(page.locator("[data-map-controls]")).toBeVisible();
    await shot(page, "mobile-project-folded");
    // A tap on it unfolds it, and the list with it.
    await drawer.locator(":scope > [aria-hidden]").tap();
    await expectDrawerHeight(page, 0.58, "project");
    await expectDrawerHeight(page, 0.58);
    // Folded again, a swipe down closes it, and the list comes back up to
    // the middle height.
    await touchMove(page, { x: 160, y: 100 }, { x: 100, y: 140 }, { steps: 10 });
    await expect(drawer).toHaveAttribute("data-snap", "folded");
    await swipeDown(page, drawer.locator(":scope > [aria-hidden]"));
    await expect(page).toHaveURL(atList);
    await expect(drawer).toBeHidden();
    await expectDrawerHeight(page, 0.58);
  });

  test("a tap on the map closes a project opened from it", async ({ page }) => {
    await page.goto("/?kart=59.9100,10.7500,13");
    await foldList(page);
    const shape = page.locator(`path[data-project-id="${project.id}"]`);
    await shape.dispatchEvent("pointerdown");
    await shape.dispatchEvent("click");
    await expect(page).toHaveURL(atProject);
    const drawer = page.locator("[data-project-drawer]");
    await expectDrawerHeight(page, 0.58, "project");
    // A drag folds it; it stays open.
    await touchMove(page, { x: 160, y: 100 }, { x: 100, y: 140 }, { steps: 10 });
    await expect(drawer).toHaveAttribute("data-snap", "folded");
    await expect(page).toHaveURL(atProject);
    // A tap closes it at once, back to the folded list it was opened over.
    await page.touchscreen.tap(40, 60);
    await expect(page).toHaveURL(atList);
    await expect(drawer).toBeHidden();
    await expectDrawerHeight(page, compact);
  });

  test("a project that zoomed the map far in flies back out on closing", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/?kart=59.9100,10.7500,6");
    await expectDrawerHeight(page, 0.58);
    const kart = () => new URL(page.url()).searchParams.get("kart")!;
    await expect.poll(kart).toMatch(/,6$/);
    const before = kart().split(",").map(Number);
    const dot = page.locator(`[data-project-id="${project.id}"]`);
    await dot.dispatchEvent("pointerdown");
    await dot.dispatchEvent("click");
    await expect(page).toHaveURL(atProject);
    await expect.poll(() => Number(kart().split(",")[2])).toBeGreaterThan(10);
    await page
      .getByRole("button", { name: "Lukk prosjekt", exact: true })
      .click();
    await expect(page).toHaveURL(atList);
    await expectDrawerHeight(page, 0.58);
    // Back where it was, at the zoom it had.
    await expect.poll(() => kart().split(",").map(Number)).toEqual([
      expect.closeTo(before[0], 2),
      expect.closeTo(before[1], 2),
      6,
    ]);
  });

  test("a project closed after the map was moved leaves the map there", async ({
    page,
  }) => {
    await page.goto("/?kart=59.9100,10.7500,13");
    await foldList(page);
    const shape = page.locator(`path[data-project-id="${project.id}"]`);
    await shape.dispatchEvent("pointerdown");
    await shape.dispatchEvent("click");
    await expect(page).toHaveURL(atProject);
    await expectDrawerHeight(page, 0.58, "project");
    // Where on screen the project lies: the drawer's height changes the
    // view the URL names, not what is where.
    const at = () =>
      shape.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return [Math.round(box.x), Math.round(box.y)];
      });
    const opened = await at();
    await touchMove(page, { x: 160, y: 60 }, { x: 60, y: 160 }, { steps: 10 });
    await expect.poll(at).not.toEqual(opened);
    await page.waitForTimeout(600);
    const moved = await at();
    await page
      .getByRole("button", { name: "Lukk prosjekt", exact: true })
      .click();
    await expect(page).toHaveURL(atList);
    await expectDrawerHeight(page, compact);
    await page.waitForTimeout(500);
    expect(await at()).toEqual(moved);
  });

  test("a project opened from the full list closes back to it, scrolled and ordered as it was", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Utvid prosjektlisten", exact: true })
      .click();
    await expectDrawerHeight(page, 1);
    const scroller = page.locator(
      "[data-explorer-drawer] [data-drawer-scroll]",
    );
    const cards = scroller.locator("[data-card-id]");
    const order = () =>
      cards.evaluateAll((items) =>
        items.map((item) => item.getAttribute("data-card-id")),
      );
    await scroller.evaluate((element) => {
      element.scrollTop = 600;
    });
    const before = { order: await order(), scroll: 600 };
    // The card nearest the top of what shows.
    const id = await scroller.evaluate((element) => {
      const top = element.getBoundingClientRect().top + 40;
      return [...element.querySelectorAll("[data-card-id]")]
        .find((card) => card.getBoundingClientRect().top >= top)!
        .getAttribute("data-card-id")!;
    });
    await scroller
      .locator(`[data-card-id="${id}"]`)
      .getByRole("button")
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/prosjekt/${id}(\\?|$)`));
    await expectDrawerHeight(page, 0.58, "project");
    await page
      .getByRole("button", { name: "Lukk prosjekt", exact: true })
      .click();
    await expect(page).toHaveURL(atList);
    await expectDrawerHeight(page, 1);
    await page.waitForTimeout(600);
    expect(await order()).toEqual(before.order);
    expect(await scroller.evaluate((element) => element.scrollTop)).toBe(
      before.scroll,
    );
    // Brought down over the map, the list follows the map again.
    await page
      .getByRole("button", { name: "Vis mer av kartet", exact: true })
      .click();
    await expectDrawerHeight(page, compact);
  });

  test("the list rests at the middle height, the map above it", async ({
    page,
  }) => {
    await page.goto("/");
    await foldList(page);
    const handle = page.getByRole("button", {
      name: "Utvid prosjektlisten",
      exact: true,
    });
    // A swipe up from the folded list stops at the middle height.
    await swipeUp(page, handle);
    await expectDrawerHeight(page, 0.58);
    const list = page.getByRole("region", {
      name: "Prosjektliste",
      exact: true,
    });
    const result = list
      .getByRole("button", { name: new RegExp(project.title) })
      .first();
    await expect(result).toBeInViewport();
    await expect(page.locator("[data-map-controls]")).toBeVisible();
    await expect(
      page.locator("[data-explorer-drawer] [data-scroll-fade]"),
    ).toHaveCount(1);
    await shot(page, "mobile-list-middle");
    // A project opened from it rests at the same height over it.
    await result.click();
    await expect(page).toHaveURL(atProject);
    await expectDrawerHeight(page, 0.58, "project");
    await expectDrawerHeight(page, 0.58);
    await page
      .getByRole("button", { name: "Lukk prosjekt", exact: true })
      .click();
    await expect(page).toHaveURL(atList);
    await expectDrawerHeight(page, 0.58);
    await expect(result).toBeFocused();
    // The handle opens it the rest of the way.
    await handle.click();
    await expectDrawerHeight(page, 1);
  });

  test("a scrolled list at the middle height scrolls back to its top before the drawer folds", async ({
    page,
  }) => {
    await page.goto("/");
    await expectDrawerHeight(page, 0.58);
    const list = page.locator("[data-explorer-drawer] [data-drawer-scroll]");
    // As if scrolled at the full height and brought back down.
    await list.evaluate((element) => {
      element.scrollTop = 120;
    });
    await expect(list).toHaveAttribute("data-scrolled", "");
    const box = (await list.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + 40;
    // A short swipe down scrolls the list, not the drawer.
    await touchMove(page, { x, y }, { x, y: y + 80 }, { steps: 12 });
    await expectDrawerHeight(page, 0.58);
    await expect
      .poll(() => list.evaluate((element) => element.scrollTop))
      .toBeLessThan(120);
    // Back at the top, the next swipe down folds it.
    await list.evaluate((element) => {
      element.scrollTop = 0;
    });
    await expect(list).not.toHaveAttribute("data-scrolled");
    await touchMove(page, { x, y }, { x, y: y + 200 }, { steps: 12 });
    await expectDrawerHeight(page, compact);
  });

  test("panning the map folds the list down from the middle height", async ({
    page,
  }) => {
    await page.goto("/");
    await expectDrawerHeight(page, 0.58);
    // A finger across the map above the list, not on the list itself.
    await touchMove(page, { x: 160, y: 100 }, { x: 100, y: 140 }, { steps: 10 });
    await expectDrawerHeight(page, compact);
  });

  test("the map credits fold behind a button once the map is moved", async ({
    page,
  }) => {
    await page.goto("/");
    const credits = page.locator("#map-credits");
    const toggle = page.getByRole("button", { name: "Kartkilder" });
    await expect(credits).toContainText("OpenStreetMap");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await touchMove(page, { x: 160, y: 100 }, { x: 100, y: 140 }, { steps: 10 });
    await expect(credits).toBeHidden();
    await toggle.click();
    await expect(credits).toBeVisible();
  });

  test("zooming the map folds the list down from the middle height", async ({
    page,
  }) => {
    await page.goto("/");
    const expand = page.getByRole("button", {
      name: "Utvid prosjektlisten",
      exact: true,
    });
    await expectDrawerHeight(page, 0.58);
    // Two fingers spread apart on the map above the list.
    const session = await page.context().newCDPSession(page);
    const pinch = (type: "touchStart" | "touchMove" | "touchEnd", spread = 0) =>
      session.send("Input.dispatchTouchEvent", {
        type,
        touchPoints:
          type === "touchEnd"
            ? []
            : [
                { x: 180, y: 140 - spread, id: 0 },
                { x: 180, y: 180 + spread, id: 1 },
              ],
      });
    await pinch("touchStart");
    for (let step = 1; step <= 8; step++) await pinch("touchMove", step * 6);
    await pinch("touchEnd");
    await session.detach();
    await expectDrawerHeight(page, compact);
    // As does a double tap.
    await swipeUp(page, expand);
    await expectDrawerHeight(page, 0.58);
    await page.locator("[data-project-map]").dblclick({ position: { x: 120, y: 100 } });
    await expectDrawerHeight(page, compact);
  });

  test("wheel and touch expand the map drawer before scrolling list, project, and account content", async ({
    page,
  }) => {
    await page.goto(projectPath);
    await expectDrawerHeight(page, 1, "project");
    // The project drawer has no lower heights; it scrolls right away.
    const content = page.locator("[data-project-scroll]");
    await content.hover();
    await page.mouse.wheel(0, 300);
    await expect
      .poll(() => content.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await expectDrawerHeight(page, 1, "project");
    await page
      .getByRole("button", { name: "Lukk prosjekt", exact: true })
      .click();
    await expectDrawerHeight(page, 0.58);
    const filters = page.getByRole("region", {
      name: "Filtrer prosjekter",
      exact: true,
    });
    await filters.hover();
    await page.mouse.wheel(0, 200);
    await expectDrawerHeight(page, 1);
    await page
      .getByRole("button", { name: "Vis mer av kartet", exact: true })
      .click();
    await expectDrawerHeight(page, compact);
    // A swipe up stops at the middle height, the next goes on to the top.
    await swipeUp(page, filters);
    await expectDrawerHeight(page, 0.58);
    await swipeUp(page, filters);
    await expectDrawerHeight(page, 1);
    // Logging in asks in a sheet over the drawer, which stays put.
    await page.getByRole("button", { name: "Logg inn", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Logg inn" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Logg inn" })).toHaveCount(0);
    await expectDrawerHeight(page, 1);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("a sideways swipe on the map pans it, not the browser's history", async ({
    page,
  }) => {
    await page.goto("/");
    const map = page.locator("[data-project-map] .leaflet-container");
    await expect(map).toBeVisible();
    // A move within Leaflet's click tolerance is left to the browser by
    // Leaflet; that first move is when a browser with swipe navigation takes
    // the gesture. Chromium holds such small moves back from the page, so
    // they're dispatched directly.
    const smallMoveCancelled = await map.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const touch = (x: number) =>
        new Touch({
          identifier: 1,
          target: element,
          clientX: x,
          clientY: rect.top + 100,
        });
      const event = (type: string, x: number) =>
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches: type === "touchend" ? [] : [touch(x)],
          changedTouches: [touch(x)],
        });
      const x = rect.left + 40;
      element.dispatchEvent(event("touchstart", x));
      const move = event("touchmove", x + 1);
      element.dispatchEvent(move);
      element.dispatchEvent(event("touchend", x + 1));
      return move.defaultPrevented;
    });
    expect(smallMoveCancelled).toBe(true);
    const pane = page.locator("[data-project-map] .leaflet-map-pane");
    const before = await pane.evaluate((element) => element.style.transform);
    const box = (await map.boundingBox())!;
    const x = box.x + 40;
    const y = box.y + Math.min(box.height / 2, 120);
    await touchMove(page, { x, y }, { x: x + 180, y }, { steps: 12 });
    await expect
      .poll(() => pane.evaluate((element) => element.style.transform))
      .not.toBe(before);
  });

  test("a modal sheet pushes the page back, and lets it go as it closes", async ({
    page,
  }) => {
    await page.goto("/");
    const root = page.locator("html");
    const pageScale = () =>
      page.evaluate(() => getComputedStyle(document.body).scale);
    await expect(
      page.getByRole("region", { name: "Filtrer prosjekter", exact: true }),
    ).toBeVisible();
    // The list's own drawer is part of the page, not a sheet over it.
    await expect(root).not.toHaveAttribute("data-pushed");
    expect(await pageScale()).toBe("none");
    await page
      .getByRole("region", { name: "Filtrer prosjekter", exact: true })
      .getByRole("button", { name: "Filtre", exact: true })
      .click();
    const sheet = page.getByRole("dialog", { name: "Filtre", exact: true });
    await expect(sheet).toBeVisible();
    await expect(root).toHaveAttribute("data-pushed");
    expect(Number(await pageScale())).toBeLessThan(1);
    // The sheet, in the top layer, is not pushed with it.
    const box = await sheet.boundingBox();
    expect(box?.width).toBe(viewport.width);
    await shot(page, "pushed-filters");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(root).not.toHaveAttribute("data-pushed");
    expect(await pageScale()).toBe("none");
  });

  test("a sheet is dragged closed from its top, and springs back from a short drag", async ({
    page,
  }) => {
    await page.goto("/");
    const filters = page.getByRole("region", {
      name: "Filtrer prosjekter",
      exact: true,
    });
    // A tap still chooses.
    await filters.getByRole("button", { name: "Filtre", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Filtre", exact: true });
    await sheet.getByRole("button", { name: /^Status/ }).click();
    const status = sheet.getByRole("listbox", {
      name: "Prosjektstatus",
      exact: true,
    });
    await expect(status).toBeVisible();
    const sheetTop = () =>
      sheet.evaluate(
        (element) => element.firstElementChild!.getBoundingClientRect().top,
      );
    const rest = await sheetTop();
    await status.getByRole("option", { name: /^Ferdigstilt/ }).tap();
    await expect(status.getByRole("option", { selected: true })).toHaveCount(4);
    // A short, slow drag follows the finger, then springs back.
    let dragged = 0;
    await drag(page, status.getByRole("option").first(), 60, {
      steps: 20,
      stepMs: 40,
      before: async () => {
        dragged = (await sheetTop()) - rest;
      },
    });
    expect(dragged).toBeGreaterThan(30);
    await expect(status).toBeVisible();
    await expect.poll(sheetTop).toBeCloseTo(rest, 0);
    // Up never moves it up.
    await drag(page, status.getByRole("option").first(), -80, {
      before: async () => {
        expect(await sheetTop()).toBeCloseTo(rest, 0);
      },
    });
    await expect(status).toBeVisible();
    // A quick drag down closes it, from a list that doesn't scroll.
    await drag(page, status.getByRole("option").first(), 180);
    await expect(sheet).toBeHidden();
    await expect(
      filters.getByRole("button", { name: "Filtre", exact: true }),
    ).toHaveAttribute("data-active");
    // A list that scrolls closes from its top.
    await filters.getByRole("button", { name: /^Sted/ }).click();
    const place = page.getByRole("listbox", { name: "Sted", exact: true });
    await expect(place).toBeVisible();
    // Past half its height.
    await drag(page, place.getByRole("option").first(), 220, { steps: 8 });
    await expect(place).toBeHidden();
    // Scrolled down, a drag first scrolls the list back to its top.
    await filters.getByRole("button", { name: /^Sted/ }).click();
    await expect(place).toBeVisible();
    await place.evaluate((element) => (element.scrollTop = 120));
    await drag(page, place.getByRole("option").nth(4), 60, {
      steps: 10,
      stepMs: 30,
    });
    await expect(place).toBeVisible();
    await expect.poll(() => place.evaluate((element) => element.scrollTop)).toBeLessThan(120);
    // Its handle drags it wherever the list is.
    await place.evaluate((element) => (element.scrollTop = 120));
    await drag(page, place.locator("[data-swipe-handle]"), 220, { steps: 8 });
    await expect(place).toBeHidden();
    await expect(
      filters.getByRole("button", { name: "Sted: Hele Norge", exact: true }),
    ).toBeVisible();
  });

  test("a sheet fades out at its end only while there is more below", async ({
    page,
  }) => {
    await page.goto("/");
    const filters = page.getByRole("region", {
      name: "Filtrer prosjekter",
      exact: true,
    });
    const opacity = (menu: Locator) =>
      menu.evaluate((element) =>
        Number(
          getComputedStyle(
            element.parentElement!.querySelector(
              "[data-slot=choice-fade][data-edge=bottom]",
            )!,
          ).opacity,
        ),
      );
    // More below: a whole fade at the top, part of it near the end, none there.
    await filters.getByRole("button", { name: /^Sted/ }).click();
    const place = page.getByRole("listbox", { name: "Sted", exact: true });
    await expect(place).toBeVisible();
    await expect.poll(() => opacity(place)).toBe(1);
    // Nothing above yet; scrolled, the top fades in under the title.
    const topFade = (menu: Locator) =>
      menu.evaluate((element) =>
        Number(
          getComputedStyle(
            element.querySelector("[data-slot=choice-fade][data-edge=top]")!,
          ).opacity,
        ),
      );
    await expect.poll(() => topFade(place)).toBe(0);
    await place.evaluate((element) => (element.scrollTop = 20));
    await expect.poll(() => topFade(place)).toBeCloseTo(0.5, 1);
    await place.evaluate((element) => (element.scrollTop = 60));
    // Mid-list, both ends show more.
    await expect.poll(() => topFade(place)).toBe(1);
    await expect.poll(() => opacity(place)).toBe(1);
    await shot(page, "mobile-sheet-both-fades");
    await place.evaluate((element) => {
      element.scrollTop = element.scrollHeight - element.clientHeight - 20;
    });
    await expect.poll(() => opacity(place)).toBeCloseTo(0.5, 1);
    await place.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect.poll(() => opacity(place)).toBe(0);
    // The last option is in full view, and the fade doesn't take its taps.
    const last = place.getByRole("option").last();
    const reachable = await last.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const scroller = element.closest("[role=listbox]")!.getBoundingClientRect();
      const hit = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.bottom - 2,
      );
      return rect.bottom <= scroller.bottom && !!hit && element.contains(hit);
    });
    expect(reachable).toBe(true);
    await last.click();
    await expect(place).toBeHidden();
  });

  test("a tap switches the map layer, though Safari doesn't focus what it taps", async ({
    page,
  }) => {
    // As in Safari: pressing a button leaves focus on the body, not the button.
    await page.addInitScript(() =>
      document.addEventListener(
        "mousedown",
        (event) => {
          if (!(event.target as Element).closest("button")) return;
          event.preventDefault();
          (document.activeElement as HTMLElement | null)?.blur();
        },
        true,
      ),
    );
    await page.goto("/");
    const map = page.locator("[data-project-map]");
    await expect(map).toHaveAttribute("data-map-style", "standard");
    await page.getByRole("button", { name: "Kartlag", exact: true }).tap();
    // Phones choose from a sheet, not the desktop menu.
    const sheet = page.getByRole("dialog", { name: "Kartlag" });
    await expect(sheet).toBeVisible();
    await expect(page.getByRole("group", { name: "Kartlag" })).toHaveCount(0);
    await sheet.getByRole("button", { name: "Gatekart", exact: true }).tap();
    await expect(map).toHaveAttribute("data-map-style", "streets");
    await expect(sheet).toBeHidden();
    await page.getByRole("button", { name: "Kartlag", exact: true }).tap();
    await expect(
      sheet.getByRole("button", { name: "Gatekart", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("filters and keyboard search work at full and compact map heights", async ({
    page,
  }) => {
    await page.goto("/");
    const filters = page.getByRole("region", {
      name: "Filtrer prosjekter",
      exact: true,
    });
    // Category and status share one sheet, behind one button.
    const filterButton = filters.getByRole("button", {
      name: "Filtre",
      exact: true,
    });
    await expect(filterButton).not.toHaveAttribute("data-active");
    await filterButton.click();
    const sheet = page.getByRole("dialog", { name: "Filtre", exact: true });
    await expectMenuFits(sheet.locator(":scope > div"));
    const categoryRow = sheet.getByRole("button", { name: /^Kategori/ });
    const statusRow = sheet.getByRole("button", { name: /^Status/ });
    await expect(categoryRow).toHaveAttribute("aria-expanded", "false");
    await expect(statusRow).toHaveAttribute("aria-expanded", "false");
    // A row opens its options; the other row stays.
    await statusRow.click();
    const status = sheet.getByRole("listbox", {
      name: "Prosjektstatus",
      exact: true,
    });
    await expectMenuFits(status);
    await expect(statusRow).toHaveAttribute("aria-expanded", "true");
    await expect(categoryRow).toBeVisible();
    await expect(status.getByRole("option", { selected: true })).toHaveCount(
      3,
    );
    await shot(page, "mobile-status-sheet");
    await status
      .getByRole("option", { name: "Ferdigstilt", exact: true })
      .click();
    await expect(status.getByRole("option", { selected: true })).toHaveCount(
      4,
    );
    // Another row opens in its place, below the first.
    await categoryRow.click();
    await expect(status).toBeHidden();
    await expect(statusRow).toHaveAttribute("aria-expanded", "false");
    await expect(
      sheet.getByRole("listbox", { name: "Kategori", exact: true }),
    ).toBeVisible();
    const categoryBox = await categoryRow.boundingBox();
    const statusBox = await statusRow.boundingBox();
    expect(statusBox!.y).toBeGreaterThan(categoryBox!.y);
    await expect(statusRow).toBeInViewport();
    // Chosen again, it folds back to both rows.
    await categoryRow.click();
    await expect(
      sheet.getByRole("listbox", { name: "Kategori", exact: true }),
    ).toBeHidden();
    await categoryRow.click();
    await sheet
      .getByRole("option", { name: project.categories[0], exact: true })
      .click();
    await expect(categoryRow).toContainText(project.categories[0]);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(filterButton).toBeFocused();
    await expect(filterButton).toHaveAttribute("data-active");
    await page
      .getByRole("button", { name: "Nullstill filtre", exact: true })
      .click();
    await swipeDown(
      page,
      page.getByRole("button", { name: "Utvid prosjektlisten", exact: true }),
    );
    await expectDrawerHeight(page, 136 / viewport.height);
    await filters
      .getByRole("button", { name: "Åpne søk", exact: true })
      .click();
    const search = page.getByRole("textbox", {
      name: "Søk etter prosjekt eller sted",
    });
    await expect(search).toBeFocused();
    await expectDrawerHeight(page, 1);
    await shot(page, "mobile-search-open");
    await search.fill("Ingen slike prosjekter");
    await expect(
      page
        .getByRole("region", { name: "Prosjektliste", exact: true })
        .getByRole("heading", { name: "Ingen treff", exact: true }),
    ).toBeVisible();
    await search.fill(project.title);
    await search.press("Enter");
    await expect(page).toHaveURL(atProject);
    // Over the map, the list come down behind it.
    await expectDrawerHeight(page, 0.58, "project");
    await expectDrawerHeight(page, 0.58);
    await page
      .getByRole("button", { name: "Lukk prosjekt", exact: true })
      .click();
    await page.getByRole("button", { name: "Lukk søk", exact: true }).click();
    await expect(search).toBeHidden();
    await expect(
      filters.getByRole("button", { name: "Åpne søk", exact: true }),
    ).toBeFocused();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.keyboard.press("/");
    await expect(search).toBeFocused();
    await search.press("Escape");
    await expect(search).toBeHidden();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
  });

  test("overview, timeline, and discussion remain readable without horizontal overflow", async ({
    page,
  }) => {
    await page.goto(projectPath);
    await expect(
      page.getByRole("region", { name: "Om prosjektet", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: /^Oppdateringer/ }).click();
    const timeline = page.getByRole("region", {
      name: "Prosjektoppdateringer",
      exact: true,
    });
    await expect(
      timeline.getByRole("heading", { name: "Nye byrom tar form" }),
    ).toBeVisible();
    await timeline
      .getByRole("button", { name: /^Se kommentarer/ })
      .first()
      .click();
    await expect(
      timeline
        .getByRole("region", {
          name: "Kommentarer til oppdateringen",
          exact: true,
        })
        .first(),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          [
            ...document.querySelectorAll(
              "[data-project-post], [data-project-scroll]",
            ),
          ].every((element) => element.scrollWidth <= element.clientWidth),
        ),
      )
      .toBe(true);
    await shot(page, `project-discussion-${viewport.width}`);
  });

  test("with nothing matching, a note above the drawer clears the filters", async ({
    page,
  }) => {
    await page.goto("/?status=completed&kategori=Drikkevann");
    const note = page.getByRole("button", {
      name: "Ingen treff med filtrene, nullstill filtre",
      exact: true,
    });
    await expect(note).toBeVisible();
    // The credits fold to make room for it.
    await expect(page.locator("#map-credits")).toHaveCount(0);
    // Just above the drawer.
    const noteBox = (await note.boundingBox())!;
    const drawerBox = (await page
      .locator("[data-explorer-drawer]")
      .boundingBox())!;
    const gap = drawerBox.y - (noteBox.y + noteBox.height);
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(40);
    await shot(page, `nothing-matches-${viewport.width}`);
    await note.click();
    await expect(note).toBeHidden();
    await expect(page).not.toHaveURL(/kategori=/);
  });
});

test("saved projects keep their collection and full reading height", async ({
  page,
  context,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const person = await member({
    username: uniqueName("drawer"),
  });
  await signIn(context, person);
  expect(
    (
      await mutation(
        request,
        "/api/community",
        { action: "save", projectId: project.id, saved: true },
        person,
      )
    ).ok(),
  ).toBe(true);
  await page.goto("/");
  // Desktop markup comes first here, then the mobile drawer replaces it.
  await expect(page.locator("[data-explorer-drawer]")).toBeVisible();
  await openSaved(page);
  // Panels open in drawers of their own, over the explorer where it was.
  await expectDrawerHeight(page, 1, "saved");
  await expectDrawerHeight(page, 0.58);
  await page
    .getByRole("region", { name: "Lagret", exact: true })
    .getByRole("button", { name: new RegExp(project.title) })
    .first()
    .click();
  await expectDrawerHeight(page, 1, "project");
  await page
    .getByRole("button", { name: "Lukk prosjekt", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Lagret", exact: true, level: 1 }),
  ).toBeVisible();
  await expectDrawerHeight(page, 1, "saved");
});

test.describe("desktop explorer", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  const oslo = "/?kart=59.9100,10.7500,13";
  const listRegion = (page: Page) =>
    page.getByRole("region", { name: "Prosjektliste", exact: true });
  const card = (page: Page, title: string) =>
    listRegion(page).getByRole("button", { name: new RegExp(`^${title} · `) });
  const mapParam = (page: Page) => new URL(page.url()).searchParams.get("kart");

  test("Nytt in two places the map shows lists the news of both", async ({
    page,
  }) => {
    // Between Oslo and Bærum, the view names both.
    await page.goto("/?kart=59.9050,10.5900,12");
    await expect(
      page
        .getByRole("region", { name: "Filtrer prosjekter", exact: true })
        .getByRole("button", { name: "Sted", exact: true }),
    ).toHaveText("Oslo og Bærum");
    const nytt = page
      .getByRole("group", { name: "Visning" })
      .getByRole("button", { name: "Nytt" });
    await expect(async () => {
      await nytt.click();
      await expect(nytt).toHaveAttribute("aria-pressed", "true", {
        timeout: 1000,
      });
    }).toPass();
    await expect(
      page.getByRole("status", {
        name: /^Nytt fra [1-9]\d* prosjekter i Oslo og Bærum$/,
      }),
    ).toBeVisible();
    const rows = listRegion(page).locator("[data-feed-id]");
    for (const title of ["Sandvika sentrum", "Fornebubanen"])
      await expect(rows.filter({ hasText: title }).first()).toBeVisible();
  });

  test("Nytt lists what last happened on each project, and opens at it", async ({
    page,
  }) => {
    await page.goto("/");
    const views = page.getByRole("group", { name: "Visning" });
    const nytt = views.getByRole("button", { name: "Nytt" });
    const switchBox = await views.boundingBox();
    // The server renders the switch, so a click can land before hydration.
    await expect(async () => {
      await nytt.click();
      await expect(nytt).toHaveAttribute("aria-pressed", "true", {
        timeout: 1000,
      });
    }).toPass();
    // Its order is what happened last, so the sort goes. The switch keeps
    // its right edge and its height, and the pressed view names itself.
    await expect(
      page.getByRole("button", { name: /^Sorter prosjekter:/ }),
    ).toHaveCount(0);
    const after = (await views.boundingBox())!;
    expect(
      Math.abs(after.x + after.width - (switchBox!.x + switchBox!.width)),
    ).toBeLessThan(1);
    expect(after.height).toBe(switchBox!.height);
    await expect(nytt.locator("[data-view-label]")).toHaveCSS("opacity", "1");
    await expect(
      views.getByRole("button", { name: "Kompakt" }).locator("[data-view-label]"),
    ).toHaveCSS("opacity", "0");
    await expect(
      page.getByRole("status", {
        name: /^Nytt fra \d+ prosjekte?r? i .+$/,
      }),
    ).toBeVisible();
    const rows = listRegion(page).locator("[data-feed-id]");
    await expect(rows.first()).toBeVisible();
    await expect(listRegion(page).locator("[data-card-id]")).toHaveCount(0);
    // Ordered by each row's newest happening, whose time comes first.
    const dates = await rows.evaluateAll((items) =>
      items.map((item) =>
        Date.parse(item.querySelector("time")!.getAttribute("datetime")!),
      ),
    );
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
    await shot(page, "list-feed");
    // Comments close together gather under their project, each its own
    // press, opening at itself.
    const group = rows.filter({ has: page.locator("[data-feed-comment]") }).first();
    await expect(group.locator("[data-feed-comment]")).not.toHaveCount(1);
    const second = group.locator("[data-feed-comment]").nth(1);
    const commentId = await second.getAttribute("data-feed-comment");
    await second.click();
    await expect(
      page.locator(`[data-comment-id="${commentId}"]`).first(),
    ).toBeInViewport();
    await page.goBack();
    // What happened leads; the project is quietly above it. Other specs add
    // updates, so the newest may be an update or a seeded comment.
    const row = listRegion(page)
      .locator("[data-event=update], [data-event=comment]")
      .first();
    const id = await row.getAttribute("data-feed-id");
    const kind = await row.getAttribute("data-event");
    const seed = seedProjects.find((item) => item.id === id);
    if (seed)
      await expect(row.locator("[data-feed-context]")).toHaveText(seed.title);
    if (seed && kind === "update")
      await expect(row).toContainText(getProjectUpdates(seed)[0].title);
    await row.getByRole("button").first().click();
    await expect(page).toHaveURL(new RegExp(`/prosjekt/${id}`));
    await expect(
      page.locator("#project-sections").getByRole("button", {
        name: kind === "update" ? /^Oppdateringer/ : /^Kommentarer/,
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("matches outside the map are counted beside the list's own", async ({
    page,
  }) => {
    // Zoomed in on central Oslo: fewer in view than in Oslo.
    await page.goto("/?kart=59.9100,10.7500,14");
    const visible = page.getByRole("status", {
      name: /^\d+ synlige? prosjekte?r? på kartet$/,
    });
    const inOslo = page.getByRole("button", {
      name: /^\d+ prosjekte?r? i Oslo$/,
    });
    await expect(visible).toHaveText(/^\d+$/);
    await expect(inOslo).toHaveText(/^\d+$/);
    await expect(page.getByText(/totalt/)).toHaveCount(0);
    // Each names what it counts when hovered.
    const tooltip = page.locator("[role=tooltip][popover]");
    await visible.hover();
    await expect(tooltip).toHaveText(
      (await visible.getAttribute("aria-label"))!,
    );
    await inOslo.hover();
    await expect(tooltip).toHaveText(/^\d+ prosjekte?r? i Oslo$/);
    await shot(page, "list-count-place");
    const count = Number(
      (await inOslo.getAttribute("aria-label"))!.match(/^\d+/)![0],
    );
    // "Nytt" shows every project in the place, not just those in view.
    const nytt = page
      .getByRole("group", { name: "Visning" })
      .getByRole("button", { name: "Nytt" });
    await expect(async () => {
      await nytt.click();
      await expect(nytt).toHaveAttribute("aria-pressed", "true", {
        timeout: 1000,
      });
    }).toPass();
    await expect(
      page.getByRole("status", {
        name: new RegExp(`^Nytt fra ${count} prosjekte?r? i Oslo$`),
      }),
    ).toBeVisible();
    await expect(inOslo).toHaveCount(0);
    await page
      .getByRole("group", { name: "Visning" })
      .getByRole("button", { name: "Kompakt" })
      .click();
    // A press on the place unfolds those out of view and scrolls to them,
    // the toggle kept clear of the list's top; the map stays put.
    const list = page.getByRole("region", { name: "Prosjektliste" });
    const toggle = list.getByRole("button", { name: "Ikke synlige på kartet" });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const url = page.url();
    await inOslo.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(
      list.getByRole("list", { name: "Utenfor kartet i Oslo" }),
    ).toBeVisible();
    await expect(async () => {
      const [region, button] = await Promise.all([
        list.boundingBox(),
        toggle.boundingBox(),
      ]);
      expect(button!.y - region!.y).toBeGreaterThan(80);
      expect(button!.y - region!.y).toBeLessThan(110);
    }).toPass();
    expect(page.url()).toBe(url);
  });

  test("the place's projects out of view follow the list's, muted until hovered", async ({
    page,
  }) => {
    await page.goto("/?kart=59.9100,10.7500,14");
    const list = page.getByRole("region", { name: "Prosjektliste" });
    const cards = list.locator("[data-card-id]");
    await expect(
      list.getByRole("list", { name: "Utenfor kartet i Oslo" }),
    ).toBeVisible();
    const muted = list.locator("[data-off-map]");
    // Once the map has settled on what it shows.
    let visible = 0;
    await expect(async () => {
      visible = Number(
        (await page
          .getByRole("status", {
            name: /^\d+ synlige? prosjekte?r? på kartet$/,
          })
          .getAttribute("aria-label"))!.match(/^\d+/)![0],
      );
      expect(visible).toBeGreaterThan(0);
      const count = await cards.count();
      expect(count).toBeGreaterThan(visible);
      expect(await muted.count()).toBe(count - visible);
    }).toPass();
    // Every muted card comes after the visible ones.
    await expect(cards.nth(visible)).toHaveAttribute("data-off-map", "true");
    await expect(cards.nth(visible - 1)).not.toHaveAttribute("data-off-map");
    await expect(
      list.getByRole("button", { name: "Ikke synlige på kartet" }),
    ).toBeVisible();
    const first = muted.first();
    await expect(first).toHaveCSS("opacity", "0.6");
    await first.hover();
    await expect(first).toHaveCSS("opacity", "1");
  });

  test("zoomed in where no project is, the place around the view still lists its projects", async ({
    page,
  }) => {
    // In Oslo, but with no project in view.
    await page.goto("/?kart=59.9900,10.8600,16");
    const list = page.getByRole("region", { name: "Prosjektliste" });
    await expect(
      page.getByRole("status", { name: "0 synlige prosjekter på kartet" }),
    ).toBeVisible();
    const offMap = list.getByRole("list", { name: "Utenfor kartet i Oslo" });
    await expect(offMap).toBeVisible();
    await expect(offMap.locator("[data-card-id]").first()).toBeVisible();
    await expect(list.locator("[data-card-id]:not([data-off-map])")).toHaveCount(
      0,
    );
  });

  test("the projects out of view fold away, and stay so in this browser", async ({
    page,
  }) => {
    await page.goto("/?kart=59.9100,10.7500,14");
    const list = page.getByRole("region", { name: "Prosjektliste" });
    const toggle = list.getByRole("button", { name: "Ikke synlige på kartet" });
    const offMap = list.getByRole("list", { name: "Utenfor kartet i Oslo" });
    // Open by default.
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(offMap).toBeVisible();
    await expect(toggle).toHaveCSS("border-bottom-width", "1px");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(offMap).toBeHidden();
    await expect(list.locator("[data-off-map]").first()).toBeHidden();
    // Its divider below stays, folded.
    await expect(toggle).toHaveCSS("border-bottom-width", "1px");
    await page.reload();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(offMap).toBeHidden();
    await toggle.click();
    await expect(offMap).toBeVisible();
  });

  for (const motion of ["reduce", "no-preference"] as const) {
    test(`unfolding the projects out of view scrolls them in, as far as the toggle near the top (${motion})`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: motion });
      const list = page.getByRole("region", { name: "Prosjektliste" });
      const toggle = list.getByRole("button", {
        name: "Ikke synlige på kartet",
      });
      const offMap = list.getByRole("list", { name: "Utenfor kartet i Oslo" });
      const unfold = async () => {
        if ((await toggle.getAttribute("aria-expanded")) === "true")
          await toggle.click();
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        // The toggle at the list's bottom.
        await toggle.evaluate((el) => el.scrollIntoView({ block: "end" }));
        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-expanded", "true");
      };
      await page.goto("/?kart=59.9100,10.7500,14");
      // Room for them all: the last comes into view.
      await unfold();
      await expect(async () => {
        const [region, last] = await Promise.all([
          list.boundingBox(),
          offMap.locator("[data-card-id]").last().boundingBox(),
        ]);
        expect(last!.y + last!.height).toBeLessThanOrEqual(
          region!.y + region!.height + 1,
        );
      }).toPass();
      // With a row and a half of them in sight once open, it stays put,
      // even at the list's end.
      await page.setViewportSize({ width: 1280, height: 1100 });
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      // Once folded away.
      await expect(offMap).toBeHidden();
      await list.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
      const before = await list.evaluate((el) => el.scrollTop);
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await page.waitForTimeout(300);
      expect(await list.evaluate((el) => el.scrollTop)).toBe(before);
      // Too little: it stops with the toggle near the top, clear of the
      // fade there.
      await page.setViewportSize({ width: 1280, height: 420 });
      await unfold();
      await expect(async () => {
        const [region, button] = await Promise.all([
          list.boundingBox(),
          toggle.boundingBox(),
        ]);
        expect(Math.abs(button!.y - region!.y - 96)).toBeLessThan(2);
      }).toPass();
    });
  }

  test("the end of the list offers a missing project", async ({ page }) => {
    await page.goto("/");
    const missing = listRegion(page).getByRole("button", {
      name: "Foreslå prosjekt",
    });
    // With too few rows to fill the list, it stays at the bottom.
    await page.getByRole("button", { name: "Åpne søk", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Søk etter prosjekt eller sted" })
      .fill("zzzzqqq");
    await expect(
      listRegion(page).getByRole("heading", { name: "Ingen treff", exact: true }),
    ).toBeVisible();
    await expect(async () => {
      const [list, button] = await Promise.all([
        listRegion(page).boundingBox(),
        missing.boundingBox(),
      ]);
      // Only the list's bottom padding below it.
      const gap = list!.y + list!.height - (button!.y + button!.height);
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThan(48);
    }).toPass();
    await expect(async () => {
      await missing.click();
      await expect(page.getByRole("dialog", { name: "Logg inn" })).toBeVisible({
        timeout: 1000,
      });
    }).toPass();
    await expect(page.getByRole("dialog", { name: "Logg inn" })).toContainText(
      "foreslå prosjekter",
    );
  });

  test("the list fades under the header once scrolled, and at its end while there is more", async ({
    page,
  }) => {
    await page.goto("/");
    const list = listRegion(page);
    await expect(list.getByRole("button", { name: / · / }).first()).toBeVisible();
    const fade = (edge: "top" | "bottom") =>
      list.evaluate(
        (element, edge) =>
          Number(
            getComputedStyle(
              element.querySelector(`[data-list-fade=${edge}]`)!,
            ).opacity,
          ),
        edge,
      );
    // At the top: more below only.
    await expect.poll(() => fade("top")).toBe(0);
    await expect.poll(() => fade("bottom")).toBe(1);
    // A little way down, the top fades in part of the way.
    await list.evaluate((element) => {
      element.scrollTop = 16;
      element.dispatchEvent(new Event("scroll"));
    });
    await expect.poll(() => fade("top")).toBeCloseTo(0.5, 1);
    await list.evaluate((element) => (element.scrollTop = 200));
    await expect.poll(() => fade("top")).toBe(1);
    await expect.poll(() => fade("bottom")).toBe(1);
    await shot(page, "desktop-list-both-fades");
    // Near the end the bottom fades out, gone there.
    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight - element.clientHeight - 20;
    });
    await expect.poll(() => fade("bottom")).toBeCloseTo(0.5, 1);
    await list.evaluate((element) => (element.scrollTop = element.scrollHeight));
    await expect.poll(() => fade("bottom")).toBe(0);
  });

  test("search opens out of its button on the filter row, and folds away", async ({
    page,
  }) => {
    await page.goto("/");
    const filters = page.getByRole("region", {
      name: "Filtrer prosjekter",
      exact: true,
    });
    const button = filters.getByRole("button", { name: "Åpne søk", exact: true });
    const search = page.getByRole("textbox", {
      name: "Søk etter prosjekt eller sted",
    });
    const place = filters.getByRole("button", { name: /^Sted/ });
    await expect(search).toBeHidden();
    // On the same line as the filters.
    const [buttonBox, placeBox] = await Promise.all([
      button.boundingBox(),
      place.boundingBox(),
    ]);
    expect(
      Math.abs(
        buttonBox!.y + buttonBox!.height / 2 - (placeBox!.y + placeBox!.height / 2),
      ),
    ).toBeLessThanOrEqual(1);
    await button.click();
    await expect(search).toBeFocused();
    await shot(page, "desktop-search-open");
    // Escape folds it back to the button.
    await search.press("Escape");
    await expect(search).toBeHidden();
    await expect(button).toBeFocused();
    // Left empty, it folds away.
    await page.keyboard.press("/");
    await expect(search).toBeFocused();
    const count = page.getByRole("status", { name: /prosjekter?$/ });
    await count.click();
    await expect(search).toBeHidden();
    // Left with words, the button stays marked, and the filters can be reset.
    await button.click();
    await search.fill("Bergen");
    await count.click();
    await expect(search).toBeHidden();
    await expect(button).toHaveAttribute("data-active", "true");
    const reset = page.getByRole("button", {
      name: "Nullstill filtre",
      exact: true,
    });
    await expect(reset).toBeVisible();
    await shot(page, "desktop-search-active");
    await button.click();
    await expect(search).toHaveValue("Bergen");
    await page.getByRole("button", { name: "Lukk søk", exact: true }).click();
    await expect(search).toBeHidden();
    await expect(button).not.toHaveAttribute("data-active");
    await expect(reset).toBeHidden();
  });

  test("the list switches between expanded cards and compact rows", async ({
    page,
  }) => {
    await page.goto("/");
    const list = page.getByRole("region", { name: "Prosjektliste", exact: true });
    const views = page.getByRole("group", { name: "Visning" });
    const expanded = views.getByRole("button", { name: "Utvidet" });
    const compact = views.getByRole("button", { name: "Kompakt" });
    // Compact rows are the default, and come first.
    await expect(compact).toHaveAttribute("aria-pressed", "true");
    const [expandedBox, compactBox] = await Promise.all([
      expanded.boundingBox(),
      compact.boundingBox(),
    ]);
    expect(compactBox!.x).toBeLessThan(expandedBox!.x);
    // The server renders the switch, so a click can land before hydration.
    await expect(async () => {
      await expanded.click();
      await expect(expanded).toHaveAttribute("aria-pressed", "true", {
        timeout: 1000,
      });
    }).toPass();

    // Expanded cards add the description and a carousel of every photo.
    const cards = list.locator("[data-card-id]");
    await expect(cards.first()).toHaveAttribute("data-density", "expanded");
    const first = cards.first();
    const gallery = first.getByRole("group", { name: /^Bilder av / });
    await expect(gallery).toBeVisible();
    await expect(first.locator("img").first()).toHaveJSProperty("complete", true);
    await shot(page, "list-expanded");
    await first.getByRole("heading").hover();
    await shot(page, "list-expanded-hover");

    // Like a feed post: the counts and saving sit under the photos.
    const comments = first.getByRole("button", { name: /^\d+ kommentarer?$/ });
    const [galleryBox, commentsBox] = await Promise.all([
      gallery.boundingBox(),
      comments.boundingBox(),
    ]);
    expect(commentsBox!.y).toBeGreaterThan(galleryBox!.y + galleryBox!.height);
    await expect(first.getByRole("button", { name: "Lagre" })).toBeVisible();
    // The comment count opens the project at its discussion.
    await comments.click();
    await expect(
      page.getByRole("button", { name: /^Kommentarer/ }),
    ).toBeInViewport();
    await page.goBack();
    // A photo opens the project too, not the lightbox.
    const id = await first.getAttribute("data-card-id");
    await gallery.getByRole("button").first().click();
    await expect(page).toHaveURL(new RegExp(`/prosjekt/${id}`));
    await expect(page.getByRole("dialog", { name: /^Bilder av / })).toHaveCount(0);
    await page.goBack();
    const titleTop = await first.getByRole("heading").boundingBox();

    // Tag the photo, to tell whether it outlives the switches.
    await first.locator("img").first().evaluate((img) => {
      img.dataset.kept = "";
    });

    // The switch acts as the mouse button goes down, and shows it at once.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    expect(
      await compact.evaluate((button) => getComputedStyle(button).transitionDuration),
    ).toBe("0s");
    await compact.hover();
    await page.mouse.down();
    await expect(compact).toHaveAttribute("aria-pressed", "true");
    await page.mouse.up();

    // Compact rows share one height, with no description or gallery.
    await expect(cards.first()).toHaveAttribute("data-density", "compact");
    const heights = await cards.evaluateAll((items) =>
      items.slice(0, 6).map((item) => item.getBoundingClientRect().height),
    );
    expect(new Set(heights).size).toBe(1);
    // The place and title stay where they were.
    expect((await first.getByRole("heading").boundingBox())!.y).toBe(
      titleTop!.y,
    );
    await expect(list.getByRole("group", { name: /^Bilder av / })).toHaveCount(0);
    await shot(page, "list-compact");
    await cards.nth(1).hover();
    await shot(page, "list-compact-hover");

    // Back to expanded, the photos are the ones already shown, not loaded
    // anew with a blank frame.
    await expanded.click();
    await expect(cards.first()).toHaveAttribute("data-density", "expanded");
    await expect(
      first.getByRole("group", { name: /^Bilder av / }).locator("img[data-kept]"),
    ).toBeVisible();
    await compact.click();

    // The choice is kept in this browser.
    await page.reload();
    await expect(
      page.getByRole("group", { name: "Visning" }).getByRole("button", { name: "Kompakt" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("the strip between two cards opens the card it hovers", async ({
    page,
  }) => {
    await page.goto(oslo);
    const row = listRegion(page).locator(`[data-card-id="${project.id}"]`);
    const box = (await row.boundingBox())!;
    // Above the card link's reach, just under the border of the card before.
    const x = box.x + box.width / 2;
    const y = box.y + 3;
    await page.mouse.move(x, y);
    // Its shape lights up once the page is hydrated.
    await expect(
      page.locator(`path[data-project-id="${project.id}"]`),
    ).toHaveAttribute("stroke-width", "4");
    expect(
      await page.evaluate(
        ([x, y]) => document.elementFromPoint(x, y)?.hasAttribute("data-card-gap"),
        [x, y],
      ),
    ).toBe(true);
    await page.mouse.down();
    await page.mouse.up();
    await expect(page).toHaveURL(new RegExp(`/prosjekt/${project.id}`));
  });

  test("the sort sits beside the count, and status shows what it hides", async ({
    page,
  }) => {
    await page.goto("/");
    const count = page.getByRole("status", { name: /prosjekter?$/ });
    const sort = page.getByRole("button", { name: /^Sorter prosjekter:/ });
    const [countBox, sortBox] = await Promise.all([
      count.boundingBox(),
      sort.boundingBox(),
    ]);
    expect(
      Math.abs(
        countBox!.y + countBox!.height / 2 - (sortBox!.y + sortBox!.height / 2),
      ),
    ).toBeLessThanOrEqual(2);
    expect(sortBox!.x).toBeGreaterThan(countBox!.x + countBox!.width);
    // Finished ones are hidden by default.
    const menu = await openFilter(page, "Status");
    // Rows as in the other menus, sized for a pointer, tinting at once.
    expect((await menu.getByRole("option").first().boundingBox())!.height).toBe(
      36,
    );
    await expect(
      page.locator("[data-filter-popover]").getByRole("button", { name: /^Status/ }),
    ).toHaveCSS("transition-duration", "0s");
    // Several can be chosen, and each chosen one is checked.
    await expect(menu).toHaveAttribute("aria-multiselectable", "true");
    await expect(menu.getByRole("option", { selected: true })).toHaveCount(3);
    await expect(
      menu.getByRole("option", { selected: true }).locator("svg.lucide-check"),
    ).toHaveCount(3);
    await shot(page, "desktop-status-menu");
    await menu.getByRole("option", { name: /^Foreslått/ }).click();
    await menu.getByRole("option", { name: /^Planlagt/ }).click();
    // The last status shown stays shown.
    await menu.getByRole("option", { name: /^Under bygging/ }).click();
    await expect(menu.getByRole("option", { selected: true })).toHaveCount(1);
    await expect(page).toHaveURL(/status=construction/);
    // All of them is no filter.
    await menu.getByRole("option", { name: /^Foreslått/ }).click();
    await menu.getByRole("option", { name: /^Planlagt/ }).click();
    await menu.getByRole("option", { name: /^Ferdigstilt/ }).click();
    await expect(menu.getByRole("option", { selected: true })).toHaveCount(4);
    await expect(page).toHaveURL(/status=alle/);
    await page.keyboard.press("Escape");
    // Every status differs from the default: a filter to reset.
    await expect(
      page.getByRole("button", { name: "Nullstill filtre", exact: true }),
    ).toBeVisible();
  });

  test("status and category filters combine, sort, and survive a reload", async ({
    page,
  }) => {
    await page.goto("/");
    const filters = page.getByRole("region", {
      name: "Filtrer prosjekter",
      exact: true,
    });
    const reset = page.getByRole("button", {
      name: "Nullstill filtre",
      exact: true,
    });
    // No place filter: the map is the place.
    await expect(reset).toBeHidden();
    const filterButton = filters.getByRole("button", {
      name: "Filtre",
      exact: true,
    });
    await expect(filterButton).not.toHaveAttribute("data-active");
    const status = await openFilter(page, "Status");
    await status.getByRole("option", { name: /^Foreslått/ }).click();
    await status.getByRole("option", { name: /^Planlagt/ }).click();
    await page.keyboard.press("Escape");
    // One filter set is enough to offer the reset, and the filter button
    // reads as set.
    await expect(reset).toBeVisible();
    await expect(filterButton).toHaveAttribute("data-active", "true");
    // Main categories first; a chosen one opens its subcategories.
    const [main, sub] = project.categories;
    const categoryMenu = await openFilter(page, "Kategori");
    // Less used categories wait under "Vis flere".
    const energy = categoryMenu.getByRole("option", { name: /^Energi/ });
    const more = categoryMenu.getByRole("button", { name: "Vis flere" });
    await expect(energy).toBeHidden();
    await more.click();
    await expect(energy).toBeVisible();
    await shot(page, "category-menu-more");
    await categoryMenu.getByRole("button", { name: "Vis færre" }).click();
    await expect(energy).toBeHidden();
    const subOption = categoryMenu.getByRole("option", {
      name: new RegExp(`^${sub}`),
    });
    await expect(subOption).toBeHidden();
    const mainOption = categoryMenu.getByRole("option", {
      name: new RegExp(`^${main}`),
    });
    await mainOption.click();
    await expect(mainOption).toHaveAttribute("aria-selected", "true");
    await expect(subOption).toBeVisible();
    // A subcategory narrows the main: it's no longer all of it.
    await subOption.click();
    await expect(mainOption).toHaveAttribute("aria-selected", "false");
    await expect(subOption).toBeVisible();
    // Unchoosing its last subcategory widens it back to all of the main,
    // still open.
    await subOption.click();
    await expect(mainOption).toHaveAttribute("aria-selected", "true");
    await expect(subOption).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`kategori=${main}(&|$)`));
    await subOption.click();
    await expect(subOption).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(
      new RegExp(`status=construction&kategori=${main},${sub}`),
    );
    const cards = listRegion(page).locator("[data-card-id]");
    await expect(cards.first()).toBeVisible();
    // Other specs add projects as they run; only the seed's are known here.
    const ids = await cards.evaluateAll((items) =>
      items.map((item) => item.getAttribute("data-card-id")),
    );
    const listed = seedProjects.filter((seed) => ids.includes(seed.id));
    expect(listed.length).toBeGreaterThan(0);
    for (const seed of listed) expect(seed.categories).toContain(sub);
    await openFilter(page, "Kategori");
    await subOption.click();
    await mainOption.click();
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/kategori=/);
    await page.getByRole("button", { name: /^Sorter prosjekter:/ }).click();
    const sort = page.getByRole("listbox", {
      name: "Sorter prosjekter",
      exact: true,
    });
    await expectMenuFits(sort);
    await sort.getByRole("option", { name: "Alfabetisk", exact: true }).click();
    await expect(sort).toBeHidden();
    await expect(
      page.getByRole("button", {
        name: "Sorter prosjekter: Alfabetisk",
        exact: true,
      }),
    ).toBeFocused();
    await expect(page).toHaveURL(/sorter=title/);
    await page.reload();
    await expect(filterButton).toHaveAttribute("data-active", "true");
    await expect(
      (await openFilter(page, "Status")).getByRole("option", { selected: true }),
    ).toHaveText([/^Under bygging/]);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", {
        name: "Sorter prosjekter: Alfabetisk",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page).toHaveURL(/status=construction&sorter=title&kart=/);
  });

  test("the list follows the map, and search can frame matches outside it", async ({
    page,
  }) => {
    // A first visit opens on all of Norway.
    await page.goto("/");
    await expect.poll(() => mapParam(page)).toMatch(/,[45](\.5)?$/);
    await expect(card(page, "Nyhavna")).toBeVisible();
    await expect(card(page, project.title)).toBeVisible();
    // A shared view opens where it was shared, and narrows the list.
    await page.goto(oslo);
    await expect(card(page, project.title)).toBeVisible();
    await expect(card(page, "Nyhavna")).toHaveCount(0);
    await page.getByRole("button", { name: "Zoom ut", exact: true }).click();
    await expect.poll(() => mapParam(page)).toMatch(/^59\.9\d*,10\.75\d*,12$/);
    // Searching finds places outside the view and offers to frame them.
    const search = page.getByRole("textbox", {
      name: "Søk etter prosjekt eller sted",
    });
    await page.getByRole("button", { name: "Åpne søk", exact: true }).click();
    await search.fill("Bergen");
    await expect(
      listRegion(page).getByRole("heading", { name: "Ingen treff", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /^Vis \d+ treff$/ })
      .click();
    await expect(card(page, "Bybanen til Åsane")).toBeVisible();
    await expect.poll(() => mapParam(page)).toMatch(/^60\./);
    await expect(page).toHaveURL(/[?&]q=Bergen&/);
    await page.reload();
    // Reopened, the words wait behind the button.
    await expect(
      page.getByRole("button", { name: "Nullstill filtre", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Åpne søk", exact: true }).click();
    await expect(search).toHaveValue("Bergen");
    await expect(card(page, "Bybanen til Åsane")).toBeVisible();
    // Without a view in the URL, the explorer reopens on the last one.
    await page.goto(oslo);
    await expect(card(page, "Nyhavna")).toHaveCount(0);
    await page.goto("/");
    await expect
      .poll(() => mapParam(page))
      .toMatch(/^59\.9\d+,10\.7[45]\d+,13$/);
  });

  test("the list follows the map while it pans, before it settles", async ({
    page,
  }) => {
    await page.goto(oslo);
    await expect(card(page, project.title)).toBeVisible();
    const view = (await page.locator(".leaflet-container").boundingBox())!;
    const y = view.y + view.height / 2;
    await page.mouse.move(view.x + view.width - 40, y);
    await page.mouse.down();
    await page.mouse.move(view.x + view.width - 760, y - 300, { steps: 12 });
    // Still held, and the list has already moved it out of view. The view
    // is still in Oslo, so it follows the rows in view, muted.
    const muted = listRegion(page)
      .locator("[data-off-map]")
      .filter({
        has: page.getByRole("button", {
          name: new RegExp(`^${project.title} · `),
        }),
      });
    await expect(muted).toBeVisible();
    await page.mouse.up();
    await expect(muted).toBeVisible();
  });

  test("hovering a card highlights its shape, not the other way round", async ({
    page,
  }) => {
    await page.goto(oslo);
    await card(page, project.title).hover();
    await expect(
      page.locator(`path[data-project-id="${project.id}"]`),
    ).toHaveAttribute("stroke-width", "4");
    // The list stays put when a shape is hovered.
    const list = listRegion(page);
    const top = await list.evaluate((element) => element.scrollTop);
    await page.locator('path[data-project-id="regjeringskvartalet"]').hover();
    await page.waitForTimeout(300);
    expect(await list.evaluate((element) => element.scrollTop)).toBe(top);
  });

  test("hovering a card shows its tooltip over the middle of its shape", async ({
    page,
  }) => {
    await page.goto(oslo);
    const tooltip = page.locator(".project-tooltip");
    await card(page, project.title).hover();
    await expect(tooltip).toHaveCount(1);
    await expect(tooltip).toContainText(project.title);
    const shape = (await page
      .locator(`path[data-project-id="${project.id}"]`)
      .boundingBox())!;
    const box = (await tooltip.boundingBox())!;
    // Centred just above the shape, pointing down at it.
    expect(
      Math.abs(box.x + box.width / 2 - (shape.x + shape.width / 2)),
    ).toBeLessThan(2);
    expect(box.y + box.height).toBeLessThanOrEqual(shape.y);
    expect(box.y + box.height).toBeGreaterThan(shape.y - 16);
    await shot(page, "card-hover-tooltip");
    await page.mouse.move(1000, 790);
    await expect(tooltip).toHaveCount(0);
  });

  test("shapes are drawn over the whole map while it pans, not just once it settles", async ({
    page,
  }) => {
    await page.goto(oslo);
    const map = page.locator(".leaflet-container");
    const drawing = page.locator(".leaflet-overlay-pane > svg").first();
    await expect(drawing).toBeVisible();
    const view = (await map.boundingBox())!;
    const covers = async () => {
      const box = (await drawing.boundingBox())!;
      return (
        box.x <= view.x + 1 &&
        box.y <= view.y + 1 &&
        box.x + box.width >= view.x + view.width - 1 &&
        box.y + box.height >= view.y + view.height - 1
      );
    };
    expect(await covers()).toBe(true);
    // Held down, so the map hasn't settled: far past the drawn margin.
    await page.mouse.move(view.x + view.width - 100, view.y + view.height / 2);
    await page.mouse.down();
    await page.mouse.move(view.x + 100, view.y + view.height / 2 - 200, {
      steps: 12,
    });
    expect(await covers()).toBe(true);
    await page.mouse.up();
  });

  test("filtering draws only the shapes that come and go", async ({ page }) => {
    await page.goto(oslo);
    const kept = page.locator(`path[data-project-id="${project.id}"]`);
    await expect(kept).toBeVisible();
    await kept.evaluate((element) => element.setAttribute("data-test-kept", ""));
    const shapes = page.locator("path[data-project-id]");
    const before = await shapes.count();
    await (await openFilter(page, "Status"))
      .getByRole("option", { name: /^Ferdigstilt/ })
      .click();
    await page.keyboard.press("Escape");
    await expect
      .poll(() => shapes.count())
      .toBeGreaterThan(before);
    // The project already on the map keeps its shape.
    await expect(kept).toHaveAttribute("data-test-kept", "");
  });

  test("hovering a grouped project's card lights up its group, and only that", async ({
    page,
  }) => {
    await page.goto("/?kart=59.9100,10.7500,10");
    const group = page.locator(`.project-cluster[data-cluster~="${project.id}"]`);
    await expect(group).toBeVisible();
    // Hovering touches the existing markers; nothing is redrawn.
    await page.locator(".leaflet-marker-pane").evaluate((pane) => {
      const changes = { count: 0 };
      Object.assign(window, { markerChanges: changes });
      new MutationObserver((records) => {
        for (const record of records)
          changes.count += record.addedNodes.length + record.removedNodes.length;
      }).observe(pane, { childList: true, subtree: true });
    });
    await card(page, project.title).hover();
    await expect(group).toHaveClass(/is-highlighted/);
    // The project stays in its group instead of being pulled out of it.
    await expect(page.locator(`path[data-project-id="${project.id}"]`)).toBeHidden();
    await expect(page.locator(".project-cluster.is-highlighted")).toHaveCount(1);
    // Its tooltip points at the group.
    const tooltip = page.locator(".project-tooltip");
    await expect(tooltip).toContainText(project.title);
    const marker = (await group.boundingBox())!;
    const box = (await tooltip.boundingBox())!;
    expect(
      Math.abs(box.x + box.width / 2 - (marker.x + marker.width / 2)),
    ).toBeLessThan(2);
    expect(box.y + box.height).toBeLessThanOrEqual(marker.y);
    await page.mouse.move(1000, 790);
    await expect(group).not.toHaveClass(/is-highlighted/);
    expect(
      await page.evaluate(
        () => (window as unknown as { markerChanges: { count: number } }).markerChanges.count,
      ),
    ).toBe(0);
  });

  test("a group flies in to frame its projects beside the list", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/?kart=59.9100,10.7500,10");
    const group = page.locator(`.project-cluster[data-cluster~="${project.id}"]`);
    const members = (await group.getAttribute("data-cluster"))!.split(" ");
    const before = new URL(page.url()).searchParams.get("kart");
    await group.click();
    // It animates: the view is still on its way a moment later.
    await page.waitForTimeout(150);
    expect(new URL(page.url()).searchParams.get("kart")).toBe(before);
    await expect
      .poll(() => new URL(page.url()).searchParams.get("kart"))
      .not.toBe(before);
    const zoom = Number(new URL(page.url()).searchParams.get("kart")!.split(",")[2]);
    expect(zoom).toBeGreaterThanOrEqual(11);
    const map = (await page.locator(".leaflet-container").boundingBox())!;
    await expectMembersIn(page, members, {
      left: map.x,
      top: map.y,
      right: map.x + map.width,
      bottom: map.y + map.height,
    });
  });

  test("groups only merge and split as the map zooms, and keep their place", async ({
    page,
  }) => {
    await page.goto("/?kart=59.9100,10.7500,10");
    await expect(page.locator(".project-cluster").first()).toBeVisible();
    const groups = () =>
      page.locator(".project-cluster").evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            ids: element.getAttribute("data-cluster")!.split(" "),
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
          };
        }),
      );
    const before = await groups();
    // While a zoom animates, groups glide with the map like its shapes do.
    expect(
      await page.locator(".project-cluster").first().evaluate((element) => {
        element.closest(".leaflet-map-pane")!.classList.add("leaflet-zoom-anim");
        const property = getComputedStyle(element).transitionProperty;
        element.closest(".leaflet-map-pane")!.classList.remove("leaflet-zoom-anim");
        return property;
      }),
    ).toContain("transform");
    const marker = page.locator(`.project-cluster[data-cluster="${before[0].ids.join(" ")}"]`);
    await marker.evaluate((element) => element.setAttribute("data-old", ""));
    await page.getByRole("button", { name: "Zoom ut", exact: true }).click();
    await expect.poll(() => mapParam(page)).toMatch(/,9$/);
    // Zoomed out, every group lies whole inside a larger one.
    const out = await groups();
    for (const { ids } of before)
      expect(
        out.some((group) => ids.every((id) => group.ids.includes(id))),
        ids.join(" "),
      ).toBe(true);
    await page.getByRole("button", { name: "Zoom inn", exact: true }).click();
    await expect.poll(() => mapParam(page)).toMatch(/,10$/);
    // Back in, the same groups stand in the same places.
    const after = await groups();
    expect(after.map(({ ids }) => ids).sort()).toEqual(
      before.map(({ ids }) => ids).sort(),
    );
    for (const group of before) {
      const match = after.find(({ ids }) => ids.join(" ") === group.ids.join(" "))!;
      expect(Math.abs(match.x - group.x)).toBeLessThan(1);
      expect(Math.abs(match.y - group.y)).toBeLessThan(1);
    }
    // A group that stays the same keeps its marker rather than being redrawn.
    if (out.some(({ ids }) => ids.join(" ") === before[0].ids.join(" ")))
      await expect(marker).toHaveAttribute("data-old", "");
  });

  test("a project closed after the map was moved leaves the map there", async ({
    page,
  }) => {
    await page.goto(oslo);
    const shape = page.locator(`path[data-project-id="${project.id}"]`);
    await shape.dispatchEvent("pointerdown");
    await shape.dispatchEvent("click");
    await expect(page).toHaveURL(atProject);
    const map = page.locator(".leaflet-container");
    // Framed on the project, then dragged by hand.
    await page.waitForTimeout(400);
    const framed = mapParam(page);
    const box = (await map.boundingBox())!;
    await page.mouse.move(box.x + box.width - 120, box.y + 120);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 320, box.y + 260, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => mapParam(page)).not.toBe(framed);
    await page.waitForTimeout(600);
    const moved = mapParam(page);
    await page.getByRole("button", { name: "Lukk prosjekt", exact: true }).click();
    await expect(page).toHaveURL(atList);
    // The URL takes the view back from the history entry once the step lands.
    await expect.poll(() => mapParam(page)).toBe(moved);
    await page.waitForTimeout(500);
    expect(mapParam(page)).toBe(moved);
  });

  test("a project opened from the map takes the open one's place", async ({
    page,
  }) => {
    await page.goto(oslo);
    const open = async (id: string) => {
      const shape = page.locator(`path[data-project-id="${id}"]`);
      await shape.dispatchEvent("pointerdown");
      await shape.dispatchEvent("click");
      await expect(page).toHaveURL(new RegExp(`/prosjekt/${id}(\\?|$)`));
    };
    await open(project.id);
    await open("regjeringskvartalet");
    await expect(
      page.getByRole("button", { name: "Lukk prosjekt", exact: true }),
    ).toHaveCount(1);
    // Closing it goes back to the list, not to the one before.
    await page.getByRole("button", { name: "Lukk prosjekt", exact: true }).click();
    await expect(page).toHaveURL(/:\d+\/(\?|$)/);
    await expect(
      page.getByRole("button", { name: "Lukk prosjekt", exact: true }),
    ).toHaveCount(0);
  });

  test("a project clicked on the map shows no focus ring; the keyboard's does", async ({
    page,
  }) => {
    await page.goto(oslo);
    const shape = page.locator(`path[data-project-id="${project.id}"]`);
    const stroke = () =>
      shape.evaluate((element) => [
        getComputedStyle(element).outlineStyle,
        getComputedStyle(element).stroke,
      ]);
    const drawn = await stroke();
    expect(drawn[0]).toBe("none");
    // Opened and closed by pointer, focus comes back to it without a ring.
    // Other tests' projects can lie on top of it, so the press is dispatched.
    await shape.dispatchEvent("pointerdown");
    await shape.dispatchEvent("click");
    await page.getByRole("button", { name: "Lukk prosjekt", exact: true }).click();
    await expect(shape).toBeFocused();
    expect(await stroke()).toEqual(drawn);
    // Closed with Escape, too: Escape isn't taken for keyboard navigation.
    await shape.dispatchEvent("pointerdown");
    await shape.dispatchEvent("click");
    await expect(
      page.getByRole("button", { name: "Lukk prosjekt", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Lukk prosjekt", exact: true }),
    ).toHaveCount(0);
    await expect(shape).toBeFocused();
    expect(await stroke()).toEqual(drawn);
    // Once the keyboard is used, the focused shape takes the accent ring.
    await page.keyboard.press("Shift");
    await expect.poll(async () => (await stroke())[1]).toBe("rgb(31, 90, 67)");
    expect((await stroke())[0]).toBe("none");
  });

  test("a dropdown opened by pointer shows no focus ring; the keyboard's does", async ({
    page,
  }) => {
    await page.goto("/");
    const focusOutline = () =>
      page.evaluate(() => {
        const element = document.activeElement;
        return element && element !== document.body
          ? getComputedStyle(element).outlineStyle
          : null;
      });
    await page.getByRole("button", { name: /^Sorter prosjekter:/ }).click();
    const list = page.getByRole("listbox", {
      name: "Sorter prosjekter",
      exact: true,
    });
    await expect(list).toBeVisible();
    expect(await focusOutline()).not.toBe("solid");
    await page.keyboard.press("ArrowDown");
    await expect.poll(focusOutline).toBe("solid");
  });

  test("zoomed out, an alignment becomes a dot that still opens it", async ({
    page,
  }) => {
    const line = page.locator('path[data-project-id="rogfast"]');
    const dot = page.locator('path[data-project-dot="rogfast"]');
    await page.goto("/?kart=59.1200,5.5000,8");
    await expect(line).toBeVisible();
    await expect(dot).toHaveCount(0);
    await page.goto("/?kart=59.1200,5.5000,7.5");
    await expect(dot).toBeVisible();
    await expect(line).toBeHidden();
    await dot.hover();
    await expect(page.locator(".project-tooltip")).toContainText("E39 Rogfast");
    await dot.click();
    await expect(page).toHaveURL(/\/prosjekt\/rogfast\?/);
  });

  test("zoomed out, an area shows as its dot alone", async ({ page }) => {
    const area = page.locator('path[data-project-id="bispevika-sor"]');
    const dot = page.locator('path[data-project-dot="bispevika-sor"]');
    await page.goto("/?kart=59.9035,10.7608,12.5");
    await expect(area).toBeVisible();
    await expect(dot).toHaveCount(0);
    await page.goto("/?kart=59.9035,10.7608,11.5");
    await expect(dot).toBeVisible();
    await expect(area).toBeHidden();
    await dot.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/prosjekt\/bispevika-sor\?/);
  });

  test("zoomed out, a smaller project becomes its dot sooner", async ({
    page,
  }) => {
    const small = page.locator('path[data-project-dot="oslo-horisont"]');
    const large = page.locator('path[data-project-id="bispevika-sor"]');
    await page.goto("/?kart=59.9100,10.7500,12.5");
    await expect(small).toBeVisible();
    await expect(large).toBeVisible();
    const short = page.locator('path[data-project-dot="akerselva"]');
    const long = page.locator('path[data-project-id="fornebubanen"]');
    await page.goto("/?kart=59.9100,10.7500,11");
    await expect(short).toBeVisible();
    await expect(long).toBeVisible();
  });

  test("dots slide with the map while it zooms", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/?kart=59.9035,10.7608,11.5");
    const dot = page.locator('path[data-project-dot="bispevika-sor"]');
    await expect(dot).toBeVisible();
    // Mid-zoom, the dot takes Leaflet's transform transition, like the
    // shapes and the base map, instead of jumping to where it lands.
    const during = await dot.evaluate((element) => {
      element.closest(".leaflet-map-pane")!.classList.add("leaflet-zoom-anim");
      const { transitionProperty } = getComputedStyle(element);
      element.closest(".leaflet-map-pane")!.classList.remove("leaflet-zoom-anim");
      return transitionProperty;
    });
    expect(during.split(", ")).toContain("transform");
  });

  test("the list panel resizes by pointer and keyboard, and remembers it", async ({
    page,
  }) => {
    await page.goto(oslo);
    const handle = page.getByRole("separator", {
      name: "Bredde på prosjektlisten",
    });
    const panel = page.locator("#project-panel");
    const width = () =>
      panel.evaluate((element) => element.getBoundingClientRect().width);
    await expect(handle).toHaveAttribute("aria-valuenow", /^\d+$/);
    const start = Number(await handle.getAttribute("aria-valuenow"));
    await expect.poll(width).toBe(start);
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, 400);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, 400, { steps: 6 });
    await expect(page.locator("[data-resizing]")).toHaveCount(1);
    await page.mouse.up();
    await expect(page.locator("[data-resizing]")).toHaveCount(0);
    await expect.poll(width).toBe(start + 60);
    await expect(handle).toHaveAttribute("aria-valuenow", String(start + 60));
    // Keys step it; it never leaves its range.
    await handle.focus();
    await page.keyboard.press("ArrowLeft");
    await expect.poll(width).toBe(start + 44);
    await page.keyboard.press("End");
    const max = Number(await handle.getAttribute("aria-valuemax"));
    await expect.poll(width).toBe(max);
    expect(max).toBeLessThan(1280 - 300);
    await page.keyboard.press("Home");
    const min = Number(await handle.getAttribute("aria-valuemin"));
    await expect.poll(width).toBe(min);
    // Narrow, the pressed view keeps its symbol alone.
    const viewLabel = page
      .getByRole("group", { name: "Visning" })
      .getByRole("button", { name: "Kompakt" })
      .locator("[data-view-label]");
    await expect(viewLabel).toBeHidden();
    // Its tooltip names it instead.
    const tooltip = page.locator("[role=tooltip][popover]");
    await viewLabel.locator("..").hover();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveText("Kompakt");
    await page.mouse.move(0, 0);
    await expect(tooltip).toBeHidden();
    // At its narrowest, the header still fits, the toggle in its place.
    const right = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((element) => element.getBoundingClientRect().right);
    expect(await right("[data-explorer-nav]")).toBeLessThanOrEqual(min);
    await expect
      .poll(async () =>
        Math.abs(
          (await right("[data-explorer-toggle]")) -
            (await right("[data-toggle-slot]")),
        ),
      )
      .toBeLessThanOrEqual(1);
    await page.reload();
    await expect.poll(width).toBe(min);
    // A double click returns to the default width.
    await handle.dblclick();
    await expect.poll(width).toBe(start);
    await expect(viewLabel).toBeVisible();
    // Named in place, it needs no tooltip: from a view whose tooltip shows,
    // moving onto it puts the tooltip away.
    const views = page.getByRole("group", { name: "Visning" });
    await views.getByRole("button", { name: "Utvidet" }).hover();
    await expect(tooltip).toHaveText("Utvidet");
    await viewLabel.locator("..").hover();
    await expect(tooltip).toBeHidden();
  });

  test("a narrow sidebar folds its controls away together, at one width", async ({
    page,
  }) => {
    await page.goto(oslo);
    const header = page.locator("[data-explorer-header]");
    const filters = page.getByRole("region", {
      name: "Filtrer prosjekter",
      exact: true,
    });
    const handle = page.getByRole("separator", {
      name: "Bredde på prosjektlisten",
    });
    const menu = header.getByRole("button", { name: "Flere valg" });
    const theme = header.getByRole("switch", { name: "Mørk modus" });
    const maximize = header.locator("[data-sidebar-maximize]");
    const login = header.getByRole("button", { name: "Logg inn", exact: true });
    const loginLabel = login.locator("[data-tooltip-label]");
    const filterButton = filters.getByRole("button", {
      name: "Filtre",
      exact: true,
    });
    const place = filters.getByRole("button", { name: /^Sted: / });
    const count = page.getByRole("status", {
      name: /^\d+ synlige? prosjekte?r? på kartet$/,
    });
    const viewLabel = page
      .getByRole("group", { name: "Visning" })
      .getByRole("button", { name: "Kompakt" })
      .locator("[data-view-label]");
    const full = [theme, maximize, loginLabel];
    const narrow = [menu];
    // The filter button shows at every width.
    await expect(filterButton).toBeVisible();
    // At its default width, everything shows.
    await expect(count).toBeVisible();
    for (const control of full) await expect(control).toBeVisible();
    for (const control of narrow) await expect(control).toBeHidden();
    await shot(page, "sidebar-full");
    // A step at a time, until the menu unfolds: everything changes with it.
    await handle.focus();
    for (let step = 0; step < 20 && !(await menu.isVisible()); step++)
      await page.keyboard.press("ArrowLeft");
    for (const control of narrow) await expect(control).toBeVisible();
    for (const control of full) await expect(control).toBeHidden();
    await expect(viewLabel).toBeHidden();
    await expect(login).toBeVisible();
    await expect(place).toBeVisible();
    await expect(count).toBeVisible();
    // One step back, everything is back.
    await page.keyboard.press("ArrowRight");
    for (const control of full) await expect(control).toBeVisible();
    for (const control of narrow) await expect(control).toBeHidden();
    await page.keyboard.press("ArrowLeft");
    await expect(menu).toBeVisible();
    // At its narrowest, nothing wraps, the place keeps its name, and the
    // toggle stands in its place.
    await page.keyboard.press("Home");
    const min = Number(await handle.getAttribute("aria-valuemin"));
    const right = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((element) => element.getBoundingClientRect().right);
    expect(await right("[data-explorer-nav]")).toBeLessThanOrEqual(min);
    await expect
      .poll(async () =>
        Math.abs(
          (await right("[data-explorer-toggle]")) -
            (await right("[data-toggle-slot]")),
        ),
      )
      .toBeLessThanOrEqual(1);
    const middle = async (locator: typeof count) => {
      const box = (await locator.boundingBox())!;
      return box.y + box.height / 2;
    };
    const countMiddle = await middle(count);
    for (const control of [
      page.getByRole("button", { name: /^Sorter prosjekter:/ }),
      page.getByRole("group", { name: "Visning" }),
    ])
      expect(Math.abs((await middle(control)) - countMiddle)).toBeLessThan(2);
    const countRight = await count.evaluate(
      (element) => element.getBoundingClientRect().right,
    );
    expect(countRight).toBeLessThan(
      (await page.getByRole("button", { name: /^Sorter prosjekter:/ }).boundingBox())!.x,
    );
    await expect(place).not.toHaveText("");
    await shot(page, "sidebar-narrow");
    // The filter button holds category and status.
    await expect(filterButton).toBeVisible();
    await filterButton.click();
    const popover = page.getByRole("dialog", { name: "Filtre", exact: true });
    await expect(popover).toBeVisible();
    await popover.getByRole("button", { name: /^Status/ }).click();
    await popover
      .getByRole("listbox", { name: "Prosjektstatus" })
      .getByRole("option", { name: /^Ferdigstilt/ })
      .click();
    await expect(page).toHaveURL(/status=alle/);
    await shot(page, "sidebar-narrow-filters");
    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
    await expect(filterButton).toHaveAttribute("data-active", "true");
    // The header's extras wait in its menu, and work from there.
    await menu.click();
    const items = page.getByRole("menu").locator("[data-overflow-action]");
    await expect(items).toHaveText(["Mørk modus", "Vis som helside"]);
    await page.getByRole("menuitemcheckbox", { name: "Mørk modus" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    // Logging in is still a press away.
    await login.click();
    await expect(page.getByRole("dialog", { name: "Logg inn" })).toBeVisible();
  });

  test("a narrow sidebar keeps titles to two lines, whole in a tooltip", async ({
    page,
  }) => {
    await page.goto("/");
    const handle = page.getByRole("separator", {
      name: "Bredde på prosjektlisten",
    });
    await handle.focus();
    await page.keyboard.press("Home");
    const titles = page.locator("[data-card-id] h2 button");
    await expect(titles.first()).toBeVisible();
    // Every title, in either view, stops at two lines.
    for (const density of ["Kompakt", "Utvidet"]) {
      await page
        .getByRole("group", { name: "Visning" })
        .getByRole("button", { name: density })
        .click();
      const clamps = await titles.evaluateAll((buttons) =>
        buttons.map(
          (button) =>
            getComputedStyle(button.querySelector("[data-tooltip-clip]")!)
              .webkitLineClamp,
        ),
      );
      expect(new Set(clamps)).toEqual(new Set(["2"]));
    }
    // A title shown whole needs no tooltip.
    const tooltip = page.locator("[role=tooltip][popover]");
    const [first, second] = [titles.nth(0), titles.nth(1)];
    await first.hover();
    await expect(tooltip).toBeHidden();
    // One too long for two lines ends in an ellipsis, and shows whole in its
    // tooltip.
    const long =
      "Et svært langt prosjektnavn som trenger mange flere linjer enn to for å bli lest helt ferdig";
    await second.evaluate((button, title) => {
      button.dataset.tooltip = title;
      button.querySelector("[data-tooltip-clip]")!.textContent = title;
    }, long);
    const lines = await second.evaluate((button) => {
      const text = button.querySelector<HTMLElement>("[data-tooltip-clip]")!;
      return text.clientHeight / parseFloat(getComputedStyle(text).lineHeight);
    });
    expect(Math.round(lines)).toBe(2);
    await second.hover();
    await expect(tooltip).toHaveText(long);
    await shot(page, "sidebar-narrow-title");
    // Back on a whole one, it goes.
    await first.hover();
    await expect(tooltip).toBeHidden();
  });

  test("projects open in a panel beside the map and return to the list", async ({
    page,
  }) => {
    await page.goto(oslo);
    const list = listRegion(page);
    // Wait for the map to narrow the list to its view.
    await expect(card(page, "Nyhavna")).toHaveCount(0);
    const target = list.locator("[data-card-id]").last();
    const id = await target.getAttribute("data-card-id");
    await target.scrollIntoViewIfNeeded();
    const scrolled = await list.evaluate((element) => element.scrollTop);
    expect(scrolled).toBeGreaterThan(0);
    const listView = mapParam(page);
    await target.getByRole("button").first().click();
    const panel = page.locator("[data-project-post]");
    await expect(panel).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/prosjekt/${id}\\?kart=`));
    // A sidebar over the list sidebar, covering it, with the list still
    // mounted (and inert) beneath it.
    const layer = page.locator("[data-project-layer]");
    await expect(layer).toBeVisible();
    await expect(page.locator("[data-explorer-layer]")).toHaveAttribute(
      "inert",
      "",
    );
    // It takes the sidebar's whole height, header included.
    await expect
      .poll(async () => {
        const box = await layer.boundingBox();
        return box && [Math.round(box.y), Math.round(box.height)];
      })
      .toEqual([0, 800]);
    await expect(
      page.getByRole("link", { name: "Planfri hjem", exact: true }),
    ).toHaveCount(0);
    const inner = await page
      .locator("#project-panel")
      .evaluate((element) => element.clientWidth);
    await expect
      .poll(async () => {
        const box = await layer.boundingBox();
        return box && [Math.round(box.x), Math.round(box.width)];
      })
      .toEqual([0, inner]);
    await expect(
      page.getByRole("region", { name: "Prosjektkart" }).first(),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator('[data-slot="drawer-popup"]')).toHaveCount(0);
    // The panel frames the project; the map shows where it is.
    await expect.poll(() => mapParam(page)).not.toBe(listView);
    // Escape returns to the list as it was, map included.
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(list).toBeVisible();
    await expect(page).toHaveURL(atList);
    await expect.poll(() => mapParam(page)).toBe(listView);
    await expect
      .poll(() => list.evaluate((element) => element.scrollTop))
      .toBe(scrolled);
    await expect(target.getByRole("button").first()).toBeFocused();
    // Browser history and reloads keep working on project URLs.
    await target.getByRole("button").first().click();
    await page.goBack();
    await expect(panel).toBeHidden();
    await page.goForward();
    await expect(panel).toBeVisible();
    await page.reload();
    await expect(panel).toBeVisible();
    await page
      .getByRole("button", { name: "Lukk prosjekt", exact: true })
      .click();
    await expect(list).toBeVisible();
    await expect(page).toHaveURL(/\/\?kart=/);
  });

  test("a project grows into a full page and back, leaving the map as it was", async ({
    page,
  }) => {
    await page.goto(oslo);
    const list = listRegion(page);
    await expect(card(page, "Nyhavna")).toHaveCount(0);
    await card(page, project.title).click();
    const layer = page.locator("[data-project-layer]");
    await expect(layer).toBeVisible();
    await expect.poll(() => mapParam(page)).toMatch(/,15$/);
    const panelView = mapParam(page);
    const top = async () => Math.round((await layer.boundingBox())!.y);
    await layer.getByRole("button", { name: "Vis som helside", exact: true }).click();
    await expect(page).toHaveURL(/[?&]visning=full/);
    await expect(layer).toHaveAttribute("data-full", "true");
    // It fills the window and uses the width. It only grows sideways.
    await expect
      .poll(async () => Math.round((await layer.boundingBox())!.width))
      .toBe(1280);
    expect(await top()).toBe(0);
    await expect(
      page.getByRole("main", { name: "Utforsk prosjekter" }),
    ).toHaveAttribute("inert", "");
    // Shareable: a reload stays on the full page.
    await page.reload();
    await expect(layer).toHaveAttribute("data-full", "true");
    // Escape steps down to the sidebar first, map untouched.
    await page.keyboard.press("Escape");
    await expect(layer).not.toHaveAttribute("data-full");
    await expect(page).not.toHaveURL(/visning=full/);
    expect(mapParam(page)).toBe(panelView);
    expect(await top()).toBe(0);
    // Closing returns to the mode the project opened in: beside the map.
    await page.getByRole("button", { name: "Lukk prosjekt", exact: true }).click();
    await expect(layer).toHaveCount(0);
    await card(page, project.title).click();
    await layer.getByRole("button", { name: "Vis som helside", exact: true }).click();
    await expect(layer).toHaveAttribute("data-full", "true");
    await page.getByRole("button", { name: "Lukk prosjekt", exact: true }).click();
    await expect(layer).toHaveCount(0);
    await expect(list).toBeVisible();
    await expect(page.locator("#project-panel")).toHaveAttribute(
      "data-sidebar-mode",
      "normal",
    );
    // Opened from the maximized list, it closes back to it.
    await page.getByRole("button", { name: "Vis som helside", exact: true }).click();
    await expect(page.locator("#project-panel")).toHaveAttribute(
      "data-sidebar-mode",
      "maximized",
    );
    await card(page, project.title).click();
    await expect(layer).toHaveAttribute("data-full", "true");
    await page.getByRole("button", { name: "Lukk prosjekt", exact: true }).click();
    await expect(layer).toHaveCount(0);
    await expect(page.locator("#project-panel")).toHaveAttribute(
      "data-sidebar-mode",
      "maximized",
    );
    await page.getByRole("button", { name: "Vis kart", exact: true }).click();
    await expect(page.locator("#project-panel")).toHaveAttribute(
      "data-sidebar-mode",
      "normal",
    );
    await expect(page).toHaveURL(atList);
  });

  test("the list collapses to the map, and projects still open beside it", async ({
    page,
  }) => {
    await page.goto(oslo);
    const panel = page.locator("#project-panel");
    const toggle = page.getByRole("button", {
      name: "Skjul prosjektlisten",
      exact: true,
    });
    const before = await toggle.boundingBox();
    const mapWidth = async () =>
      Math.round(
        (await page.getByRole("region", { name: "Prosjektkart" }).first().boundingBox())!
          .width,
      );
    const narrow = await mapWidth();
    await toggle.click();
    await expect(panel).toHaveAttribute("data-sidebar-mode", "collapsed");
    // The list slides away over a map already at its new size.
    await expect.poll(mapWidth).toBe(1280);
    await expect(listRegion(page)).toBeHidden();
    expect(narrow).toBeLessThan(1280);
    // The toggle glides from the header's end to just right of the logo.
    const expand = page.getByRole("button", {
      name: "Vis prosjektlisten",
      exact: true,
    });
    const logo = page.locator("[data-sidebar-tab]").getByRole("link", {
      name: "Planfri hjem",
      exact: true,
    });
    await expect(logo).toBeVisible();
    await expect
      .poll(async () => {
        const [box, mark] = [await expand.boundingBox(), await logo.boundingBox()];
        return box && mark && [box.x < before!.x, box.x >= mark.x + mark.width - 1];
      })
      .toEqual([true, true]);
    // A project picked on the map opens as the usual sidebar panel...
    // Other tests' projects can lie on top of it, so no pointer here.
    await page
      .locator(`path[data-project-id="${project.id}"]`)
      .first()
      .dispatchEvent("click");
    const layer = page.locator("[data-project-layer]");
    await expect(layer).toBeVisible();
    await expect
      .poll(async () => {
        const box = await layer.boundingBox();
        return box && [Math.round(box.x), Math.round(box.y), box.width < 700];
      })
      .toEqual([0, 0, true]);
    // ...and closing it returns to the collapsed list, also after a reload.
    await page.getByRole("button", { name: "Lukk prosjekt", exact: true }).click();
    await expect(layer).toHaveCount(0);
    await expect(panel).toHaveAttribute("data-sidebar-mode", "collapsed");
    await expect(listRegion(page)).toBeHidden();
    await page.reload();
    await expect(panel).toHaveAttribute("data-sidebar-mode", "collapsed");
    await expect(expand).toBeVisible();
    await expand.click();
    await expect(listRegion(page)).toBeVisible();
    await expect.poll(mapWidth).toBe(narrow);
  });

  test("the street and OpenStreetMap maps load", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("planfri:basemap", "on"));
    await page.goto(oslo);
    const basemap = page.locator("[data-basemap]");
    await expect(basemap).toHaveAttribute("data-basemap", "idle", { timeout: 20_000 });
    await page.getByRole("button", { name: "Kartlag", exact: true }).click();
    await page.getByRole("button", { name: "Gatekart", exact: true }).click();
    await expect(basemap).toHaveAttribute("data-map-style", "streets");
    await expect(basemap).toHaveAttribute("data-basemap", "idle", { timeout: 20_000 });
    await page.getByRole("button", { name: "Kartlag", exact: true }).click();
    await page.getByRole("button", { name: "OpenStreetMap", exact: true }).click();
    await expect(basemap).toHaveAttribute("data-map-style", "osm");
    await expect(basemap).toHaveAttribute("data-basemap", "idle", { timeout: 20_000 });
    await expect(page.getByText("Kartet kunne ikke lastes")).toHaveCount(0);
  });

  test("the list's header and filter controls hide with it as it collapses", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(oslo);
    // Read as the list is hidden, so none can linger visible after it.
    await page.locator("[data-explorer-layer]").evaluate((layer) => {
      const shown: string[] = [];
      Object.assign(window, { shown });
      new MutationObserver(() => {
        if (!layer.classList.contains("invisible")) return;
        for (const button of layer.querySelectorAll("button")) {
          const name = button.getAttribute("aria-label") ?? button.textContent?.trim();
          if (getComputedStyle(button).visibility === "visible") shown.push(name ?? "");
        }
      }).observe(layer, { attributeFilter: ["class"] });
    });
    await page.getByRole("button", { name: "Skjul prosjektlisten", exact: true }).click();
    await expect(page.locator("[data-explorer-layer]")).toHaveClass(/\binvisible\b/);
    expect(await page.evaluate(() => (window as unknown as { shown: string[] }).shown)).toEqual([]);
  });

  test("the base map moves with the list's edge, in the same frame", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    // Specs run without the base map unless they ask for it.
    await page.addInitScript(() => localStorage.setItem("planfri:basemap", "on"));
    await page.goto(oslo);
    const basemap = page.locator("[data-basemap]");
    await expect(page.locator(".leaflet-gl-layer")).toBeAttached();
    await page.getByRole("button", { name: "Skjul prosjektlisten", exact: true }).click();
    const panel = page.locator("#project-panel");
    await expect(panel).toHaveAttribute("data-sidebar-mode", "collapsed");
    await expect(basemap).toHaveAttribute("data-basemap", "idle", { timeout: 20_000 });
    // Checked as the map takes its new size, before that frame is painted:
    // the base map's canvas already has the size and place to match.
    await page.locator(".leaflet-container").evaluate((element) => {
      const misfits: number[][] = [];
      Object.assign(window, { misfits });
      new ResizeObserver(() => {
        const map = element.getBoundingClientRect();
        const layer = element.querySelector(".leaflet-gl-layer")!;
        const gl = layer.getBoundingClientRect();
        const canvas = layer.querySelector("canvas")!;
        const width = canvas.width / devicePixelRatio;
        misfits.push(
          [
            gl.left - (map.left - map.width * 0.15),
            gl.width - map.width * 1.3,
            width - map.width * 1.3,
          ].map(Math.round),
        );
      }).observe(element);
    });
    await page.getByRole("button", { name: "Vis prosjektlisten", exact: true }).click();
    await expect(panel).toHaveAttribute("data-sidebar-mode", "normal");
    // The first entry is from before; the second, the map taking its size.
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { misfits: number[][] }).misfits.length,
        ),
      )
      .toBeGreaterThan(1);
    const misfits = await page.evaluate(
      () => (window as unknown as { misfits: number[][] }).misfits,
    );
    for (const misfit of misfits)
      for (const value of misfit) expect(Math.abs(value)).toBeLessThanOrEqual(1);
  });

  test("maximized, the list filters by place and the map follows it back", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(oslo);
    await expect(card(page, "Nyhavna")).toHaveCount(0);
    const filters = page.getByRole("region", {
      name: "Filtrer prosjekter",
      exact: true,
    });
    // Beside the map, the place names what the map shows.
    const place = (name: string) =>
      filters.getByRole("button", { name: `Sted: ${name}`, exact: true });
    await expect(place("Oslo")).toBeVisible();
    await page.getByRole("button", { name: "Vis som helside", exact: true }).click();
    await expect(page.locator("#project-panel")).toHaveAttribute(
      "data-sidebar-mode",
      "maximized",
    );
    await expect(
      page.getByRole("main", { name: "Utforsk prosjekter" }),
    ).toHaveAttribute("inert", "");
    // The map no longer narrows the list; the place does instead.
    await expect(card(page, project.title)).toBeVisible();
    await expect(card(page, "Nyhavna")).toHaveCount(0);
    await place("Oslo").click();
    const options = page.getByRole("listbox", { name: "Sted", exact: true });
    await options.getByRole("option", { name: /^Hele Norge/ }).click();
    await expect(place("Hele Norge")).toHaveText("Hele Norge");
    await expect(card(page, "Nyhavna")).toBeVisible();
    await place("Hele Norge").click();
    await options.getByRole("option", { name: /^Bergen/ }).click();
    await expect(place("Bergen")).toBeVisible();
    await expect(card(page, "Bybanen til Åsane")).toBeVisible();
    await expect(card(page, "Nyhavna")).toHaveCount(0);
    await expect(card(page, project.title)).toHaveCount(0);
    await expect(page).toHaveURL(/visning=full&sted=Bergen/);
    await page.reload();
    await expect(card(page, "Bybanen til Åsane")).toBeVisible();
    await expect(card(page, "Nyhavna")).toHaveCount(0);
    // Back beside the map, it shows the place picked, which stays picked.
    await page.getByRole("button", { name: "Vis kart", exact: true }).click();
    await expect.poll(() => mapParam(page)).toMatch(/^60\.3/);
    await expect(page).not.toHaveURL(/sted=/);
    await expect(place("Bergen")).toBeVisible();
    await expect(card(page, "Bybanen til Åsane")).toBeVisible();
    await expect(card(page, project.title)).toHaveCount(0);
    // Both ways lay out once and morph in a view transition, never per
    // frame; Escape also restores.
    const clipping = () =>
      page.evaluate(() =>
        Boolean(document.documentElement.dataset.sidebarTransition),
      );
    // Drawing the base map can hold up the page while it animates.
    await expect(page.locator("[data-basemap]")).toHaveAttribute(
      "data-basemap",
      "idle",
    );
    await page.getByRole("button", { name: "Vis som helside", exact: true }).click();
    await expect.poll(clipping).toBe(true);
    await expect.poll(clipping).toBe(false);
    await page.keyboard.press("Escape");
    await expect.poll(clipping).toBe(true);
    await expect(page.locator("#project-panel")).toHaveAttribute(
      "data-sidebar-mode",
      "normal",
    );
    await expect.poll(clipping).toBe(false);
    await expect(
      page.getByRole("main", { name: "Utforsk prosjekter" }),
    ).not.toHaveAttribute("inert");
  });

  test("restoring the maximized list keeps the map's view", async ({ page }) => {
    await page.goto("/?kart=59.9100,10.7500,16");
    await expect(
      page
        .getByRole("region", { name: "Filtrer prosjekter", exact: true })
        .getByRole("button", { name: "Sted: Oslo", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Vis som helside", exact: true }).click();
    await expect(page.locator("#project-panel")).toHaveAttribute(
      "data-sidebar-mode",
      "maximized",
    );
    await page.getByRole("button", { name: "Vis kart", exact: true }).click();
    await expect(page.locator("#project-panel")).toHaveAttribute(
      "data-sidebar-mode",
      "normal",
    );
    // Long enough for a fly to the place to have moved the map.
    await page.waitForTimeout(800);
    expect(mapParam(page)).toBe("59.9100,10.7500,16");
  });
});

test("a view of two places names both; twin cities count as one", () => {
  const oslo = projectPlaces("Oslo", [59.91, 10.75]);
  const baerum = projectPlaces("Bærum", [59.9, 10.53]);
  const bergen = projectPlaces("Bergen", [60.39, 5.32]);
  const vestland = projectPlaces("Vestland", [61.2, 6.0]);
  expect(placeInView([oslo, oslo, baerum], 12)).toBe("Oslo og Bærum");
  expect(placeInView([baerum, baerum, oslo], 12)).toBe("Bærum og Oslo");
  expect(placeInView([oslo, oslo], 12)).toBe("Oslo");
  // A city and its county is the city's, not both.
  expect(placeInView([bergen, bergen, vestland], 12)).toBe("Bergen");
  // Zoomed out, only the two named already stay named.
  expect(placeInView([oslo, baerum], 10, "", 11)).toBe("");
  expect(placeInView([oslo, baerum], 10, "Oslo og Bærum", 10)).toBe(
    "Oslo og Bærum",
  );
  // A view with no projects in it is in the place around it that has some.
  const withProjects = new Set(["Oslo", "Bergen", "Vestland"]);
  const around = (center: [number, number]) => ({ center, withProjects });
  expect(placeInView([], 16, "", 16, around([59.99, 10.86]))).toBe("Oslo");
  expect(placeInView([], 16, "", 16, around([60.37, 5.33]))).toBe("Bergen");
  expect(placeInView([], 16, "", 16, around([61.5, 6.5]))).toBe("Vestland");
  expect(placeInView([], 16, "", 16, around([63.41, 10.4]))).toBe("");
  expect(placeInView([], 10, "", 11, around([59.99, 10.86]))).toBe("");
  expect(placeInView([], 10, "Oslo", 10, around([59.99, 10.86]))).toBe("Oslo");
  expect(projectPlaces("Sandnes", [58.85, 5.74])).toEqual([
    "Stavanger/Sandnes",
    "Rogaland",
  ]);
  expect(projectPlaces("Stavanger", [58.97, 5.73])[0]).toBe("Stavanger/Sandnes");
});

test.describe("the place menu", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test("goes to the main cities first, then the rest A–Å, none marked", async ({
    page,
  }) => {
    await page.goto("/?kart=59.9100,10.7500,12");
    const trigger = page
      .getByRole("region", { name: "Filtrer prosjekter", exact: true })
      .getByRole("button", { name: "Sted: Oslo", exact: true });
    await trigger.click();
    const menu = page.getByRole("listbox", { name: "Sted", exact: true });
    const labels = await menu
      .getByRole("option")
      .evaluateAll((options) => options.map((option) => option.dataset.label));
    expect(labels.slice(0, 11)).toEqual(["Hele Norge", ...mainCities]);
    const rest = labels.slice(11) as string[];
    expect(rest.length).toBeGreaterThan(0);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, "nb")));
    expect(rest).not.toContain("Stavanger");
    // A line sets the rest apart.
    await expect(menu.getByRole("separator")).toHaveCount(1);
    await expect(
      menu.locator('[data-label="Ålesund"] + [role="separator"]'),
    ).toHaveCount(1);
    // Oslo is where the map is, not a choice kept.
    await expect(menu.getByRole("option", { selected: true })).toHaveCount(0);
  });

  test("pins up to three places to its top, apart from the rest", async ({
    page,
  }) => {
    await page.goto("/?kart=59.9100,10.7500,12");
    const trigger = page
      .getByRole("region", { name: "Filtrer prosjekter", exact: true })
      .getByRole("button", { name: "Sted: Oslo", exact: true });
    await trigger.click();
    const menu = page.getByRole("listbox", { name: "Sted", exact: true });
    const labels = () =>
      menu
        .getByRole("option")
        .evaluateAll((options) => options.map((o) => o.dataset.label));
    const pin = (name: string) =>
      menu.getByRole("button", { name: `Fest ${name}`, exact: true });
    // No counts; the pin shows on hover.
    await expect(
      menu.locator('[data-slot="choice-option"] .tabular-nums'),
    ).toHaveCount(0);
    await expect(pin("Bergen")).toHaveCSS("opacity", "0");
    await menu.getByRole("option", { name: "Bergen", exact: true }).hover();
    await expect(pin("Bergen")).toHaveCSS("opacity", "1");
    await pin("Bergen").click();
    await expect(pin("Bergen")).toHaveAttribute("aria-pressed", "true");
    expect((await labels()).slice(0, 2)).toEqual(["Bergen", "Hele Norge"]);
    await expect(
      menu.locator('[data-label="Bergen"] + [role="separator"]'),
    ).toHaveCount(1);
    // Pinned, it shows on hover too, filled.
    await page.mouse.move(0, 0);
    await expect(pin("Bergen")).toHaveCSS("opacity", "0");
    await pin("Trondheim").click();
    await pin("Ålesund").click();
    expect((await labels()).slice(0, 4)).toEqual([
      "Bergen",
      "Trondheim",
      "Ålesund",
      "Hele Norge",
    ]);
    await menu.getByRole("option", { name: "Drammen", exact: true }).hover();
    await shot(page, "place-menu-pins");
    // Three is the most; a fourth can't be pinned.
    await expect(pin("Oslo")).toHaveAttribute("aria-disabled", "true");
    await pin("Oslo").click({ force: true });
    await expect(pin("Oslo")).toHaveAttribute("aria-pressed", "false");
    expect((await labels())[0]).toBe("Bergen");
    // The menu stays open throughout, and the pins stay after a reload.
    await expect(menu).toBeVisible();
    await page.reload();
    await trigger.click();
    expect((await labels()).slice(0, 4)).toEqual([
      "Bergen",
      "Trondheim",
      "Ålesund",
      "Hele Norge",
    ]);
    // Unpinned, a place goes back among the rest.
    await pin("Trondheim").click();
    const after = await labels();
    expect(after.slice(0, 3)).toEqual(["Bergen", "Ålesund", "Hele Norge"]);
    expect(after.indexOf("Trondheim")).toBeGreaterThan(3);
  });
});

test.describe("the place follows the map", () => {
  const zoomOf = (page: Page) =>
    Number(new URL(page.url()).searchParams.get("kart")?.split(",")[2]);
  const latOf = (page: Page) =>
    Number(new URL(page.url()).searchParams.get("kart")?.split(",")[0]);
  const listed = (page: Page, title: string) =>
    page
      .getByRole("region", { name: "Prosjektliste", exact: true })
      .getByRole("button", { name: new RegExp(`^${title} · `) });

  test.describe("desktop", () => {
    test.use({ viewport: { width: 1280, height: 800 } });
    const place = (page: Page, name: string) =>
      page
        .getByRole("region", { name: "Filtrer prosjekter", exact: true })
        .getByRole("button", { name: `Sted: ${name}`, exact: true });

    test("picking a place moves the map; zooming names the place; clearing shows Norway", async ({
      page,
    }) => {
      await page.goto("/?kart=59.9100,10.8500,9");
      // Zoomed out over Oslo, the view names no place yet.
      await expect(place(page, "Hele Norge")).toHaveText("Velg sted");
      const zoomIn = page.getByRole("button", { name: "Zoom inn", exact: true });
      await zoomIn.click();
      await expect.poll(() => zoomOf(page)).toBe(10);
      await zoomIn.click();
      await expect.poll(() => zoomOf(page)).toBe(11);
      await expect(place(page, "Oslo")).toBeVisible();
      // Picking moves the map, and the list follows it.
      await place(page, "Oslo").click();
      const options = page.getByRole("listbox", { name: "Sted", exact: true });
      await options.getByRole("option", { name: /^Bergen/ }).click();
      await expect.poll(() => latOf(page)).toBeCloseTo(60.37, 1);
      await expect(place(page, "Bergen")).toBeVisible();
      await expect(listed(page, "Bybanen til Åsane")).toBeVisible();
      await expect(listed(page, seedProjects[0].title)).toHaveCount(0);
      // Zooming out of Bergen clears it once the view is wide. A picked
      // place holds while the map moves to it.
      await page.waitForTimeout(1600);
      const zoomOut = page.getByRole("button", { name: "Zoom ut", exact: true });
      await expect(async () => {
        await zoomOut.click();
        await expect.poll(() => zoomOf(page), { timeout: 1500 }).toBeLessThan(11);
      }).toPass();
      await expect(place(page, "Hele Norge")).toHaveText("Velg sted");
      // A picked county holds its wide framing until zoomed out of.
      await place(page, "Hele Norge").click();
      await options.getByRole("option", { name: /^Vestland/ }).click();
      await expect(place(page, "Vestland")).toBeVisible();
      await expect.poll(() => zoomOf(page)).toBeLessThan(9);
      await page.waitForTimeout(1600);
      await expect(place(page, "Vestland")).toBeVisible();
      const framed = zoomOf(page);
      await expect(async () => {
        await zoomOut.click();
        await expect.poll(() => zoomOf(page), { timeout: 1500 }).toBeLessThan(framed);
      }).toPass();
      await expect(place(page, "Hele Norge")).toHaveText("Hele Norge");
      await expect(async () => {
        await zoomOut.click();
        await expect.poll(() => zoomOf(page), { timeout: 1500 }).toBeLessThan(6);
      }).toPass();
      await expect(place(page, "Hele Norge")).toHaveText("Hele Norge");
      // Clearing shows all of Norway.
      await place(page, "Hele Norge").click();
      await options.getByRole("option", { name: /^Bergen/ }).click();
      await expect(place(page, "Bergen")).toBeVisible();
      await place(page, "Bergen").click();
      await options.getByRole("option", { name: /^Hele Norge/ }).click();
      await expect(place(page, "Hele Norge")).toHaveText("Hele Norge");
      await expect.poll(() => zoomOf(page)).toBeLessThan(7);
      await expect(listed(page, "Nyhavna")).toBeVisible();
    });

    test("a longer place's name is uncovered as its pill grows, never ending in …", async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto("/?sted=Oslo");
      // Framed on Oslo first, so the map doesn't name it over the pick.
      await expect.poll(() => latOf(page)).toBeCloseTo(59.91, 1);
      await place(page, "Oslo").click();
      type Frame = {
        text: string;
        fits: boolean;
        overflow: string;
        fading: boolean;
      };
      // Every frame from the pick until the pill rests: the words, whether
      // they fit, and how they'd be cut short if they don't.
      await place(page, "Oslo").evaluate((button) => {
        const label = button.querySelector<HTMLElement>(":scope > span")!;
        const frames: Frame[] = [];
        (window as unknown as { frames_: Frame[] }).frames_ = frames;
        const sample = () => {
          frames.push({
            text: label.textContent,
            fits: label.scrollWidth <= label.clientWidth,
            overflow: getComputedStyle(label).textOverflow,
            fading: label.getAnimations().length > 0,
          });
          if (frames.length < 40) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await page
        .getByRole("listbox", { name: "Sted", exact: true })
        .getByRole("option", { name: /^Vestland/ })
        .click();
      await expect(place(page, "Vestland")).toHaveText("Vestland");
      const read = () =>
        page.evaluate(
          () => (window as unknown as { frames_: Frame[] }).frames_,
        );
      await expect.poll(async () => (await read()).length).toBe(40);
      const after = (await read()).filter(
        (frame) => frame.text === "Vestland",
      );
      // The new words show at once, without fading in. While the pill is
      // too narrow for them they're clipped at its edge, not ended in "…".
      expect(after.some((frame) => !frame.fits)).toBe(true);
      for (const frame of after) {
        expect(frame.fading).toBe(false);
        if (!frame.fits) expect(frame.overflow).toBe("clip");
      }
      expect(after.at(-1)).toMatchObject({ fits: true, overflow: "ellipsis" });
    });

    test("a place named late in a slow frame still resizes its pill from the start", async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto("/?sted=Vestland");
      await expect.poll(() => latOf(page)).toBeCloseTo(60.9, 0);
      await place(page, "Vestland").click();
      const option = page
        .getByRole("listbox", { name: "Sted", exact: true })
        .getByRole("option", { name: /^Oslo/ });
      await expect(option).toBeVisible();
      // Picked at the end of a long frame, as a pan ending names a place: by
      // the first frame drawn after, the resizing has barely begun.
      const first = await option.evaluate(
        (option) =>
          new Promise<number>((resolve) => {
            requestAnimationFrame(() => {
              const until = performance.now() + 200;
              while (performance.now() < until);
              (option as HTMLElement).click();
              const look = () => {
                const motion = document
                  .getAnimations()
                  .find(
                    (animation) =>
                      animation.id === "choice-width" &&
                      animation.playState === "running",
                  );
                if (motion) resolve(Number(motion.currentTime));
                else requestAnimationFrame(look);
              };
              requestAnimationFrame(look);
            });
          }),
      );
      await expect(place(page, "Oslo")).toHaveText("Oslo");
      expect(first).toBeLessThan(60);
    });

    test("a linked place frames the map", async ({ page }) => {
      await page.goto("/?sted=Trondheim");
      await expect(place(page, "Trondheim")).toBeVisible();
      await expect.poll(() => latOf(page)).toBeCloseTo(63.41, 1);
      await expect(listed(page, "Nyhavna")).toBeVisible();
    });
  });

  test.describe("mobile", () => {
    test.use({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      userAgent: devices["Pixel 7"].userAgent,
    });

    test("a tap on what's in view names it for a moment", async ({ page }) => {
      await page.goto("/?kart=59.9100,10.7500,14");
      const drawer = page.locator("[data-explorer-drawer]");
      const visible = drawer.getByRole("status", {
        name: /^\d+ synlige? prosjekte?r? på kartet$/,
      });
      await expect(visible).toHaveText(/^\d+$/);
      const tooltip = page.locator("[role=tooltip][popover]");
      await visible.tap();
      await expect(tooltip).toHaveText(
        (await visible.getAttribute("aria-label"))!,
      );
      await expect(tooltip).toBeHidden({ timeout: 4000 });
      // The place's count unfolds those out of view, as on desktop.
      const toggle = drawer.getByRole("button", {
        name: "Ikke synlige på kartet",
      });
      await toggle.tap();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await drawer
        .getByRole("button", { name: /^\d+ prosjekte?r? i Oslo$/ })
        .tap();
      await expect(tooltip).toBeHidden();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(toggle).toBeInViewport();
    });

    test("a picked place keeps the drawer's height, coming down from full, framed above it", async ({
      page,
    }) => {
      await page.goto("/?kart=64.0000,12.0000,4");
      const drawer = page.locator("[data-explorer-drawer]");
      const filters = drawer.getByRole("region", {
        name: "Filtrer prosjekter",
        exact: true,
      });
      const place = (name: string) =>
        filters.getByRole("button", { name: `Sted: ${name}`, exact: true });
      const options = page.getByRole("listbox", { name: "Sted", exact: true });
      const pick = async (from: string, to: string) => {
        await place(from).click();
        await options.getByRole("option", { name: new RegExp(`^${to}`) }).click();
        await expect(place(to)).toBeVisible();
      };
      // Bergen's projects lie in the map the drawer leaves open, framed
      // close.
      const framedAbove = async () => {
        await expect(listed(page, "Bybanen til Åsane")).toHaveCount(1);
        const top = await drawer.evaluate(
          (element) => element.getBoundingClientRect().top,
        );
        await expectMembersIn(page, ["bybanen"], {
          left: 0,
          top: 0,
          right: 390,
          bottom: top,
        });
        await expect.poll(() => zoomOf(page)).toBeGreaterThanOrEqual(9.5);
      };
      // At the middle height it stays there.
      await expect(place("Hele Norge")).toHaveText("Hele Norge");
      await pick("Hele Norge", "Bergen");
      await expectDrawerHeight(page, 0.58);
      await framedAbove();
      // Folded, it stays folded.
      await foldList(page);
      await pick("Bergen", "Hele Norge");
      await expectDrawerHeight(page, compact);
      await expect.poll(() => zoomOf(page)).toBeLessThan(7);
      // At the full height, it comes down to the middle one.
      await page
        .getByRole("button", { name: "Utvid prosjektlisten", exact: true })
        .click();
      await expectDrawerHeight(page, 1);
      await pick("Hele Norge", "Bergen");
      await expectDrawerHeight(page, 0.58);
      await framedAbove();
    });

    test("the compact drawer names the place the map shows above it", async ({
      page,
    }) => {
      // Bergen's projects sit low on the map, just above the compact drawer.
      await page.goto("/?kart=60.4400,5.3200,12");
      const filters = page
        .locator("[data-explorer-drawer]")
        .getByRole("region", { name: "Filtrer prosjekter", exact: true });
      const place = (name: string) =>
        filters.getByRole("button", { name: `Sted: ${name}`, exact: true });
      await foldList(page);
      await expect(place("Bergen")).toBeVisible();
    });

    test("pins show in the sheet once turned on in its menu", async ({
      page,
    }) => {
      await page.goto("/?kart=60.4400,5.3200,12");
      await page
        .locator("[data-explorer-drawer]")
        .getByRole("region", { name: "Filtrer prosjekter", exact: true })
        .getByRole("button", { name: /^Sted/ })
        .click();
      const sheet = page.getByRole("listbox", { name: "Sted", exact: true });
      const pin = (name: string) =>
        sheet.getByRole("button", { name: `Fest ${name}`, exact: true });
      await expect(sheet).toBeVisible();
      await expect(pin("Trondheim")).toHaveCount(0);
      await sheet.getByRole("button", { name: "Flere valg" }).click();
      await page
        .getByRole("menuitemcheckbox", { name: "Fest steder til toppen" })
        .click();
      // The sheet stays, now with its pins.
      await expect(pin("Trondheim")).toBeVisible();
      await pin("Trondheim").click();
      await expect(pin("Trondheim")).toHaveAttribute("aria-pressed", "true");
      await expect(sheet.getByRole("option").first()).toHaveAttribute(
        "data-label",
        "Trondheim",
      );
      await shot(page, "place-sheet-pins");
      // Turned off, the pins go; the pinned place stays on top.
      await sheet.getByRole("button", { name: "Flere valg" }).click();
      await page
        .getByRole("menuitemcheckbox", { name: "Fest steder til toppen" })
        .click();
      await expect(pin("Trondheim")).toHaveCount(0);
      await expect(sheet.getByRole("option").first()).toHaveAttribute(
        "data-label",
        "Trondheim",
      );
    });

    test("the compact drawer names the place while the map is still moving", async ({
      page,
    }) => {
      // Near Bergen's edge, so the drag takes the view out of it.
      await page.goto("/?kart=60.4400,5.3600,11");
      const filters = page
        .locator("[data-explorer-drawer]")
        .getByRole("region", { name: "Filtrer prosjekter", exact: true });
      await foldList(page);
      const trigger = filters.getByRole("button", { name: /^Sted: / });
      await expect(trigger).toHaveText("Bergen");
      const start = page.url();
      // Renaming the pill mid-pan leaves the rest of the list as it is.
      const list = page.getByRole("region", { name: "Prosjektliste", exact: true });
      await list.evaluate((element) => {
        const win = window as unknown as { listChanges: number };
        win.listChanges = 0;
        new MutationObserver((records) => {
          win.listChanges += records.filter(
            (record) =>
              !(record.target as Element).closest?.("[data-slot=choice-select]") &&
              !record.target.parentElement?.closest("[data-slot=choice-select]"),
          ).length;
        }).observe(element, { childList: true, subtree: true, attributes: true });
      });
      // Bergen dragged off the screen: the finger still down, the map not
      // yet settled, the name has already let go of it.
      await touchMove(
        page,
        { x: 370, y: 200 },
        { x: 20, y: 200 },
        {
          before: async () => {
            await expect(trigger).not.toHaveText("Bergen");
            expect(page.url()).toBe(start);
            expect(
              await page.evaluate(
                () => (window as unknown as { listChanges: number }).listChanges,
              ),
            ).toBe(0);
          },
        },
      );
    });

    test("a picked place resizes its pill at once", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto("/?sted=Vestland");
      const filters = page
        .locator("[data-explorer-drawer]")
        .getByRole("region", { name: "Filtrer prosjekter", exact: true });
      const place = (name: string) =>
        filters.getByRole("button", { name: `Sted: ${name}`, exact: true });
      await expect(place("Vestland")).toHaveText("Vestland");
      await place("Vestland").click();
      await page
        .getByRole("listbox", { name: "Sted", exact: true })
        .getByRole("option", { name: /^Oslo/ })
        .click();
      await expect(place("Oslo")).toHaveText("Oslo");
      const resizing = await place("Oslo").evaluate((button) =>
        button
          .parentElement!.getAnimations()
          .some((animation) => animation.id === "choice-width"),
      );
      expect(resizing).toBe(false);
    });
  });
});

test.describe("desktop sidebar panels", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("header pages open as panels over the explorer, in the sidebar's mode", async ({
    page,
    context,
  }) => {
    const moderator = await member({
      username: uniqueName("panel"),
      email: "panel-moderator@example.test",
    });
    await signIn(context, moderator);
    await page.goto("/?kart=59.9100,10.7500,13");
    const list = page.getByRole("region", { name: "Prosjektliste", exact: true });
    await expect(list).toBeVisible();
    const sidebar = page.locator("#project-panel");
    const box = async (name: string) => {
      const found = await page
        .locator(`[data-sidebar-layer="${name}"]`)
        .boundingBox();
      return found && [found.x, found.y, Math.round(found.width), found.height];
    };
    // Covering the sidebar: the width is relative to the sidebar's, read
    // each time, since the sidebar widens to fit its header as it hydrates.
    const besideMap = async (name: string) => {
      const found = await box(name);
      const inner = await sidebar.evaluate((element) => element.clientWidth);
      return found && [found[0], found[1], found[2] - inner, found[3]];
    };

    // Forslag: a panel on its own URL, covering the whole sidebar.
    await page.getByRole("button", { name: "Konto", exact: true }).click();
    await accountMenuItem(page, /^Forslag/).click();
    const suggestions = page.locator('[data-sidebar-panel="suggestions"]');
    await expect(suggestions).toBeVisible();
    await expect(page).toHaveURL(/\/forslag\?kart=/);
    await expect(
      suggestions.getByRole("heading", { name: "Forslag", exact: true }),
    ).toBeVisible();
    await expect.poll(() => besideMap("suggestions")).toEqual([0, 0, 0, 800]);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // The same maximize control as a project.
    await suggestions
      .getByRole("button", { name: "Vis som helside", exact: true })
      .click();
    await expect.poll(() => box("suggestions")).toEqual([0, 0, 1280, 800]);
    await expect(page).toHaveURL(/visning=full/);
    await suggestions
      .getByRole("button", { name: "Vis i sidepanel", exact: true })
      .click();
    await expect.poll(() => besideMap("suggestions")).toEqual([0, 0, 0, 800]);
    // A direct link opens the explorer with the panel on it.
    await page.reload();
    await expect(suggestions).toBeVisible();
    await expect(list).toBeHidden();
    await suggestions.getByRole("button", { name: "Lukk", exact: true }).click();
    await expect(suggestions).toHaveCount(0);
    await expect(list).toBeVisible();
    await expect(page).toHaveURL(atList);

    // Lagret and the profile open the same way.
    await openSaved(page);
    const saved = page.locator('[data-sidebar-panel="saved"]');
    await expect(saved).toBeVisible();
    await expect.poll(() => besideMap("saved")).toEqual([0, 0, 0, 800]);
    await page.keyboard.press("Escape");
    await expect(saved).toHaveCount(0);
    await openOwnProfile(page);
    const account = page.locator('[data-sidebar-panel="account"]');
    await expect(account).toBeVisible();
    await expect(account.locator("[data-account-panel]")).toBeVisible();
    // Maximized, panels opened over it stay maximized.
    await account.getByRole("button", { name: "Vis som helside", exact: true }).click();
    await expect.poll(() => box("account")).toEqual([0, 0, 1280, 800]);
    // Closing returns to the mode the profile opened in.
    await account.getByRole("button", { name: "Lukk", exact: true }).click();
    await expect(account).toHaveCount(0);
    await expect(sidebar).toHaveAttribute("data-sidebar-mode", "normal");
    await expect(list).toBeVisible();
  });
});

test.describe("the list holds what the uncovered map shows", () => {
  // Listed as in view: the place's projects out of it follow, muted.
  const listed = (page: Page, title: string) =>
    page
      .getByRole("region", { name: "Prosjektliste", exact: true })
      .locator("[data-card-id]:not([data-off-map])")
      .getByRole("button", { name: new RegExp(`^${title} · `) });
  const byId = (id: string) => seedProjects.find((item) => item.id === id)!;
  const zoom = 14;
  // Web Mercator pixels at `zoom`, as Leaflet places them.
  const scale = 256 * 2 ** zoom;
  const toPixel = ([lat, lng]: [number, number]) => [
    (scale * (lng + 180)) / 360,
    scale *
      (0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI)),
  ];
  const toLatLng = ([x, y]: number[]) => [
    (Math.atan(Math.exp((0.5 - y / scale) * 2 * Math.PI)) * 360) / Math.PI - 90,
    (x / scale) * 360 - 180,
  ];
  /** A view placing `point` at `at` in the map's container. */
  async function viewWith(
    page: Page,
    point: [number, number],
    at: [number, number],
  ) {
    const box = (await page.locator(".leaflet-container").boundingBox())!;
    const [x, y] = toPixel(point);
    const [lat, lng] = toLatLng([
      x - at[0] + box.width / 2,
      y - at[1] + box.height / 2,
    ]);
    return `/?kart=${lat.toFixed(6)},${lng.toFixed(6)},${zoom}`;
  }
  async function show(page: Page, url: string) {
    await page.goto(url);
    await expect(page.locator("path[data-project-id]").first()).toBeAttached();
    // Far away, so this only passes once the map has narrowed the list.
    await expect(listed(page, "Nyhavna")).toHaveCount(0);
  }
  const area = byId("regjeringskvartalet");
  const east = area.geometry.reduce((a, b) => (b[1] > a[1] ? b : a));
  const north = area.geometry.reduce((a, b) => (b[0] > a[0] ? b : a));
  const line = byId("fornebubanen");

  test.describe("desktop", () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test("behind the sidebar is out; just past its edge is in", async ({
      page,
    }) => {
      await page.goto("/");
      const box = (await page.locator(".leaflet-container").boundingBox())!;
      const aside = (await page.locator("#project-panel").boundingBox())!;
      // The map starts where the sidebar ends: none of it lies behind.
      expect(Math.round(box.x)).toBe(Math.round(aside.x + aside.width));
      await show(page, await viewWith(page, east, [-8, 300]));
      await expect(listed(page, area.title)).toHaveCount(0);
      await show(page, await viewWith(page, east, [8, 300]));
      await expect(listed(page, area.title)).toBeVisible();
      // Just past the right and bottom edges is out too.
      const west = area.geometry.reduce((a, b) => (b[1] < a[1] ? b : a));
      await show(page, await viewWith(page, west, [box.width + 8, 300]));
      await expect(listed(page, area.title)).toHaveCount(0);
      const south = area.geometry.reduce((a, b) => (b[0] < a[0] ? b : a));
      await show(page, await viewWith(page, south, [300, -8]));
      await expect(listed(page, area.title)).toHaveCount(0);
      await show(page, await viewWith(page, north, [300, box.height + 8]));
      await expect(listed(page, area.title)).toHaveCount(0);
      await show(page, await viewWith(page, north, [300, box.height - 8]));
      await expect(listed(page, area.title)).toBeVisible();
    });

    test("an alignment counts where it runs, not across its bounding box", async ({
      page,
    }) => {
      await page.goto("/");
      const box = (await page.locator(".leaflet-container").boundingBox())!;
      // Within the line's extent, but well clear of its bend.
      const [start, , , end] = line.geometry;
      const corner: [number, number] = [end[0] + 0.004, start[1] - 0.004];
      await show(page, await viewWith(page, corner, [box.width / 2, box.height / 2]));
      await expect(listed(page, line.title)).toHaveCount(0);
      // No corner in view, only the middle of a side passing through.
      const [a, b] = line.geometry;
      const middle: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      await show(page, await viewWith(page, middle, [box.width / 2, box.height / 2]));
      await expect(listed(page, line.title)).toBeVisible();
    });
  });

  test.describe("mobile", () => {
    test.use({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      userAgent: devices["Pixel 7"].userAgent,
    });

    test("a group zooms to frame its projects above the drawer", async ({
      page,
    }) => {
      await page.goto("/?kart=59.8000,10.7500,9.5");
      await foldList(page);
      const group = page.locator(`.project-cluster[data-cluster~="${area.id}"]`);
      const members = (await group.getAttribute("data-cluster"))!.split(" ");
      const before = new URL(page.url()).searchParams.get("kart");
      await group.tap();
      await expect
        .poll(() => new URL(page.url()).searchParams.get("kart"))
        .not.toBe(before);
      const top = await page
        .locator("[data-explorer-drawer]")
        .evaluate((element) => element.getBoundingClientRect().top);
      await expectMembersIn(page, members, {
        left: 0,
        top: 0,
        right: 390,
        bottom: top,
      });
    });

    test("under the drawer is out; just above it is in", async ({ page }) => {
      await page.goto("/");
      const drawer = page.locator("[data-explorer-drawer]");
      await expectDrawerHeight(page, 0.58);
      const top = await drawer.evaluate(
        (element) => element.getBoundingClientRect().top,
      );
      const south = area.geometry.reduce((a, b) => (b[0] < a[0] ? b : a));
      await show(page, await viewWith(page, north, [195, top + 8]));
      await expect(listed(page, area.title)).toHaveCount(0);
      await show(page, await viewWith(page, south, [195, top - 8]));
      await expect(listed(page, area.title)).toBeVisible();
    });
  });
});

test("menus, the sidebar and projects open as the mouse goes down", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const sort = page.getByRole("button", { name: /^Sorter prosjekter:/ });
  // The server renders the menu, so a click can land before hydration.
  await expect(async () => {
    await sort.click();
    await expect(sort).toHaveAttribute("aria-expanded", "true", {
      timeout: 1000,
    });
  }).toPass();
  await page.keyboard.press("Escape");
  await expect(sort).toHaveAttribute("aria-expanded", "false");

  const press = async (target: Locator) => {
    const box = (await target.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
  };
  // The release doesn't act again: the menu stays open, then a press shuts it.
  await press(sort);
  await expect(sort).toHaveAttribute("aria-expanded", "true");
  await page.mouse.up();
  await expect(
    page.getByRole("listbox", { name: "Sorter prosjekter" }),
  ).toBeVisible();
  await press(sort);
  await expect(sort).toHaveAttribute("aria-expanded", "false");
  await page.mouse.up();

  const panel = page.locator("#project-panel");
  await press(page.getByRole("button", { name: "Skjul prosjektlisten" }));
  await expect(panel).toHaveAttribute("data-sidebar-mode", "collapsed");
  await page.mouse.up();
  await press(page.getByRole("button", { name: "Vis prosjektlisten" }));
  await expect(panel).toHaveAttribute("data-sidebar-mode", "normal");
  await page.mouse.up();

  const card = page.locator("[data-card-id]").first();
  const id = await card.getAttribute("data-card-id");
  await press(card.locator("h2 button"));
  await expect(page.locator("[data-project-post]")).toBeVisible();
  await page.mouse.up();
  await expect(page).toHaveURL(new RegExp(`/prosjekt/${id}`));
});

test("search, filters, saving and the full page act as the mouse goes down", async ({
  page,
  context,
}) => {
  await signIn(context, await member({ username: uniqueName() }));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const filters = page.getByRole("region", {
    name: "Filtrer prosjekter",
    exact: true,
  });
  const sort = page.getByRole("button", { name: /^Sorter prosjekter:/ });
  await expect(async () => {
    await sort.click();
    await expect(sort).toHaveAttribute("aria-expanded", "true", {
      timeout: 1000,
    });
  }).toPass();
  await page.keyboard.press("Escape");
  const press = async (target: Locator) => {
    const box = (await target.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
  };

  // The search opens, and keeps its focus past the release.
  const searchButton = filters.getByRole("button", { name: "Åpne søk" });
  const field = page.getByLabel("Søk etter prosjekt eller sted");
  await press(searchButton);
  await expect(field).toBeFocused();
  await page.mouse.up();
  await expect(field).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(searchButton).toBeFocused();

  // The filter button opens its popover, and its rows open.
  const filterButton = filters.getByRole("button", {
    name: "Filtre",
    exact: true,
  });
  const popover = page.locator("[data-filter-popover]");
  await press(filterButton);
  await expect(popover).toBeVisible();
  await page.mouse.up();
  await expect(popover).toBeVisible();
  const statusRow = popover.getByRole("button", { name: /^Status/ });
  await press(statusRow);
  await expect(statusRow).toHaveAttribute("aria-expanded", "true");
  await page.mouse.up();
  await expect(statusRow).toHaveAttribute("aria-expanded", "true");
  await press(filterButton);
  await expect(popover).toBeHidden();
  await page.mouse.up();
  await expect(popover).toBeHidden();

  // A card's save, in the expanded view, then the project's.
  await page
    .getByRole("group", { name: "Visning" })
    .getByRole("button", { name: "Utvidet" })
    .click();
  const card = page.locator("[data-card-id]").first();
  const cardSave = card.locator("[data-save]");
  await press(cardSave);
  await expect(cardSave).toHaveAttribute("aria-pressed", "true");
  await page.mouse.up();
  await expect(cardSave).toHaveAttribute("aria-pressed", "true");
  await press(cardSave);
  await expect(cardSave).toHaveAttribute("aria-pressed", "false");
  await page.mouse.up();

  await card.locator("h2 button").click();
  const save = page.locator("[data-project-actions] [data-save]");
  await press(save);
  await expect(save).toHaveAttribute("aria-pressed", "true");
  await page.mouse.up();
  await expect(save).toHaveAttribute("aria-pressed", "true");

  const full = page.locator("[data-project-full]");
  await press(full);
  await expect(page).toHaveURL(/[?&]visning=full/);
  await page.mouse.up();
  await expect(full).toHaveAccessibleName("Vis i sidepanel");
});
