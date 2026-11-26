import {
  devices,
  expect,
  test,
  type Locator,
  type Page,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { seedProjects } from "../scripts/seed-data";
import {
  accountMenuItem,
  member,
  mutation,
  openDiscussion,
  openOwnProfile,
  openSaved,
  origin,
  projectAction,
  shot,
  signIn,
  swipeDown,
  uniqueName,
} from "./support";

const project = seedProjects[0];
const projectPath = `/prosjekt/${project.id}`;
/** Where a heading's capitals and first letter are on the page. */
const capitals = (heading: Locator) =>
  heading.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const context = document.createElement("canvas").getContext("2d")!;
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const metrics = context.measureText("H");
    // The ink of the first letter, past its side bearing.
    const first = context.measureText(element.textContent!.trim()[0]);
    const content =
      metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;
    const baseline =
      rect.top +
      parseFloat(style.paddingTop) +
      (parseFloat(style.lineHeight) - content) / 2 +
      metrics.fontBoundingBoxAscent;
    const top = baseline - metrics.actualBoundingBoxAscent;
    return {
      top,
      bottom: baseline,
      left: rect.left + parseFloat(style.paddingLeft) - first.actualBoundingBoxLeft,
    };
  });
const top = (page: Page, selector: string) =>
  page.locator(selector).evaluate((element) =>
    Math.round(element.getBoundingClientRect().top),
  );

/**
 * The room between the project's title and its meta row, with the title as
 * it is and run long enough to wrap past the buttons beside it. Measured in
 * one pass from the top of its scroll, so nothing moves in between.
 */
const titleGaps = async (post: Locator) => {
  await expect(post.locator("[data-project-meta]")).toBeVisible();
  return post.evaluate((element) => {
    const title = element.querySelector<HTMLElement>("#project-card-title")!;
    const meta = element.querySelector("[data-project-meta] p")!;
    element.querySelector("[data-project-scroll]")!.scrollTop = 0;
    const measure = () => {
      const range = document.createRange();
      range.selectNodeContents(title);
      const lines = new Set(
        [...range.getClientRects()].map((rect) => Math.round(rect.top)),
      ).size;
      const gap =
        meta.getBoundingClientRect().top - title.getBoundingClientRect().bottom;
      return { lines, gap: Math.round(gap) };
    };
    const short = measure();
    title.textContent =
      "Et prosjekt med et navn langt nok til å gå over flere linjer";
    return { short, long: measure() };
  });
};

test("a wrapped project title keeps its room above the meta row", async ({
  page,
}) => {
  await page.goto(projectPath);
  const { short, long } = await titleGaps(page.locator("[data-project-post]"));
  expect(short.lines).toBe(1);
  expect(long.lines).toBeGreaterThan(1);
  expect(long.gap).toBe(short.gap);
});

test("a project shows its phase and its facts, and opens on its updates", async ({
  page,
}) => {
  await page.goto(projectPath);
  const post = page.locator("[data-project-post]");
  const phases = post.getByRole("list", { name: "Fase" });
  // Each step with its date, where it has one; "Ferdig" has the year.
  await expect(phases.getByRole("listitem")).toHaveText([
    "Foreslått",
    "Planstart, 2019",
    "Byggestart, apr. 2023",
    `Ferdig, ${project.year}`,
  ]);
  await expect(phases.locator("[aria-current=step]")).toHaveCount(1);
  await expect(phases).toHaveAttribute("data-phase-strip", project.status);
  // Under way with a start and a year it's due, the stretch to Ferdig fills
  // as far as time has come. Dated stretches are as long as the time they
  // span, so Byggestart (apr. 2023) sits between Planstart (2019) and Ferdig
  // by both: mid-2019 to mid-April 2023, then on to mid-2028.
  await expect(phases).toHaveAttribute("data-phase-active", "construction");
  const width = (phase: string) =>
    phases
      .locator(`[data-phase=${phase}]`)
      .evaluate((element) => element.getBoundingClientRect().width);
  const mid = (year: number, month = 7) => Date.UTC(year, month - 1, 1);
  const spans =
    (mid(Number(project.year)) - Date.UTC(2023, 3, 16)) /
    (Date.UTC(2023, 3, 16) - mid(2019));
  expect((await width("construction")) / (await width("planned"))).toBeCloseTo(
    spans,
    1,
  );
  const fill = Number(
    await phases.locator("[data-phase-progress]").getAttribute("data-phase-progress"),
  );
  expect(fill).toBeGreaterThan(0);
  expect(fill).toBeLessThanOrEqual(1);
  await expect(post.locator("[data-project-meta]")).toContainText(
    project.developer,
  );
  const tabs = post.locator("#project-sections").getByRole("button");
  await expect(tabs.first()).toHaveText(/^Oppdateringer/);
  await expect(tabs.first()).toHaveAttribute("aria-pressed", "true");
  // Guests get a quiet line between the tabs and the comments, and the
  // comments' order sits on the tabs' line, with no count.
  await openDiscussion(page);
  const discussion = post.getByRole("region", { name: "Kommentarer", exact: true });
  const line = discussion.locator("[data-login-to-comment]");
  await expect(line).toBeVisible();
  const comment = discussion.locator("[data-comment-id]").first();
  expect((await line.boundingBox())!.y).toBeLessThan(
    (await comment.boundingBox())!.y,
  );
  const sort = post
    .locator("#project-sections")
    .getByRole("button", { name: /^Sorter kommentarer:/ });
  await expect(sort).toBeVisible();
  expect(
    Math.abs(
      (await sort.boundingBox())!.y +
        (await sort.boundingBox())!.height / 2 -
        ((await tabs.first().boundingBox())!.y +
          (await tabs.first().boundingBox())!.height / 2),
    ),
  ).toBeLessThan(3);
  await expect(discussion).not.toContainText(/\d+ kommentar/);
});

test.describe("login prompt", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("signed out, the header offers a labelled log-in button and no suggesting", async ({
    page,
  }) => {
    await page.goto("/");
    const header = page.locator("[data-explorer-header]");
    const login = header.getByRole("button", { name: "Logg inn", exact: true });
    await expect(login).toBeVisible();
    await expect(login).toHaveText("Logg inn");
    await expect(header.getByRole("button", { name: /prosjekt$/ })).toHaveCount(0);
    // As tall as it is clear, on the line its icon neighbours share.
    const middle = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return Math.round(rect.top + rect.height / 2);
    };
    expect(await login.evaluate(middle)).toBe(
      await page.locator("[data-sidebar-toggle]").evaluate(middle),
    );
    await shot(page, "header-logged-out");
    await login.click();
    const prompt = page.getByRole("dialog", { name: "Logg inn" });
    await expect(prompt).toBeVisible();
    await expect(
      prompt.getByRole("button", { name: "Logg inn med Google" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(prompt).toHaveCount(0);
    await expect(login).toBeFocused();
  });

  test("actions that need an account say why", async ({ page }) => {
    const prompt = page.getByRole("dialog", { name: "Logg inn" });
    await page.goto(projectPath);
    const post = page.locator("[data-project-post]");
    await expect(post).toBeVisible();
    await projectAction(page, "Lagre");
    await expect(prompt).toContainText(
      "Du må være logget inn for å lagre prosjekter.",
    );
    await expect(page).toHaveURL(new RegExp(projectPath));
    await shot(page, "desktop-login-prompt");
    await prompt.getByRole("button", { name: "Lukk", exact: true }).click();
    await expect(prompt).toHaveCount(0);

    await openDiscussion(page);
    await post
      .getByRole("button", { name: "Logg inn", exact: true })
      .first()
      .click();
    await expect(prompt).toContainText("for å kommentere");
    await page.keyboard.press("Escape");
    await expect(prompt).toHaveCount(0);
  });
});

test.describe("desktop panels", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
});

test.describe("map menu", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("right-clicking the map starts a project there, zoomed in", async ({
    browser,
  }) => {
    const moderator = await member({
      username: uniqueName("map_menu_mod"),
      email: "map-menu-moderator@example.test",
    });
    const person = await member({ username: uniqueName("map_menu") });
    const open = async (account: typeof person) => {
      const context = await browser.newContext({
        baseURL: origin,
        viewport: { width: 1280, height: 800 },
      });
      await signIn(context, account);
      const page = await context.newPage();
      await page.goto("/?kart=60.3913,5.3221,13");
      const map = page.locator("[data-project-map] .leaflet-container");
      await expect(map).toBeVisible();
      const box = (await map.boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
        button: "right",
      });
      return page;
    };

    const page = await open(moderator);
    const menu = page.locator("[data-map-menu]");
    await expect(menu).toBeVisible();
    await shot(page, "map-menu");
    await menu.getByRole("menuitem", { name: "Legg til prosjekt her" }).click();
    await expect(menu).toHaveCount(0);
    const editor = page.locator("[data-project-editor]");
    await expect(editor.getByLabel("Sted", { exact: true })).toHaveValue("Bergen");
    // Close enough in to draw at: tens of metres, not the city.
    await expect(
      page.locator("[data-draw-surface-map] .leaflet-control-scale-line"),
    ).toHaveText("50 m");
    await page.context().close();

    const memberPage = await open(person);
    await memberPage
      .locator("[data-map-menu]")
      .getByRole("menuitem", { name: "Foreslå prosjekt her" })
      .click();
    await expect(
      memberPage.getByRole("heading", { name: "Foreslå prosjekt" }),
    ).toBeVisible();
    await expect(
      memberPage
        .locator("[data-project-editor]")
        .getByLabel("Sted", { exact: true }),
    ).toHaveValue("Bergen");
    await memberPage.context().close();
  });
});

test.describe("mobile panels", () => {
  test.use({
    viewport: devices["iPhone 13"].viewport,
    userAgent: devices["iPhone 13"].userAgent,
    hasTouch: true,
    isMobile: true,
  });

  test("a wrapped project title keeps its room above the meta row", async ({ page }) => {
    await page.goto(projectPath);
    const { short, long } = await titleGaps(
      page.locator('[data-panel-drawer="project"] [data-project-post]'),
    );
    expect(short.lines).toBe(1);
    expect(long.lines).toBeGreaterThan(1);
    expect(long.gap).toBe(short.gap);
  });

  test("project actions are a sheet; locked ones ask to log in, with the reason", async ({ page }) => {
    await page.goto(projectPath);
    const drawer = page.locator('[data-panel-drawer="project"]');
    await expect(drawer.locator("[data-project-post]")).toBeVisible();
    // The project's actions gather in a sheet; those needing an account
    // are greyed out, and say why when chosen.
    await drawer.getByRole("button", { name: "Handlinger" }).click();
    const actions = page.getByRole("dialog", { name: "Handlinger" });
    await expect(actions).toBeVisible();
    const save = actions.getByRole("button", { name: "Lagre, krever innlogging" });
    await expect(save).toHaveAttribute("data-locked", "true");
    await expect(
      actions.getByRole("button", { name: "Foreslå endring, krever innlogging" }),
    ).toHaveAttribute("data-locked", "true");
    await expect(
      actions.getByRole("button", { name: "Kopier lenke", exact: true }),
    ).not.toHaveAttribute("data-locked");
    await expect
      .poll(() =>
        actions.locator("> div").evaluate((element) =>
          Math.round(window.innerHeight - element.getBoundingClientRect().bottom),
        ),
      )
      .toBe(0);
    await shot(page, "mobile-actions-sheet");
    await save.click();
    await expect(actions).toHaveCount(0);
    const prompt = page.getByRole("dialog", { name: "Logg inn" });
    await expect(prompt).toContainText(
      "Du må være logget inn for å lagre prosjekter.",
    );
    // Along the bottom edge, like the filter menus.
    const sheet = prompt.locator("> div");
    await expect
      .poll(() =>
        sheet.evaluate(
          (element) =>
            Math.round(window.innerHeight - element.getBoundingClientRect().bottom),
        ),
      )
      .toBe(0);
    await shot(page, "mobile-login-prompt");
  });

  test("panels open as drawers over the explorer, which stays put", async ({
    page,
    context,
  }) => {
    const person = await member({ username: uniqueName("drawer") });
    await signIn(context, person);
    await page.goto("/");
    const explorer = "[data-explorer-drawer]";
    await expect(page.locator(explorer)).toBeVisible();
    // Up to full height, so a moving drawer below would show.
    await page
      .getByRole("button", { name: "Utvid prosjektlisten", exact: true })
      .click();
    await expect.poll(() => top(page, explorer)).toBeLessThan(40);
    const before = await top(page, explorer);
    const scale = () =>
      page
        .locator(explorer)
        .evaluate((element) => getComputedStyle(element).transform);
    const transform = await scale();

    await openOwnProfile(page);
    const account = page.locator('[data-panel-drawer="account"]');
    await expect(account.locator("[data-account-panel]")).toBeVisible();
    await expect.poll(() => top(page, '[data-panel-drawer="account"]')).toBeGreaterThan(before);
    expect(await top(page, explorer)).toBe(before);
    expect(await scale()).toBe(transform);
    await shot(page, "mobile-profile-drawer");

    await account.getByRole("button", { name: "Lukk", exact: true }).click();
    await expect(account).toHaveCount(0);
    expect(await top(page, explorer)).toBe(before);

    // A project opened from the list rests over the map instead, the list
    // come down to the same height behind it.
    await page
      .getByRole("region", { name: "Prosjektliste", exact: true })
      .getByRole("link", { name: new RegExp(project.title) })
      .first()
      .click();
    const projectDrawer = page.locator('[data-panel-drawer="project"]');
    await expect(projectDrawer.locator("[data-project-post]")).toBeVisible();
    await expect
      .poll(() => top(page, explorer))
      .toBeCloseTo(page.viewportSize()!.height * (1 - 0.58), -1);
    await page
      .getByRole("button", { name: "Lukk prosjekt", exact: true })
      .click();
    await expect(projectDrawer).toHaveCount(0);
  });

  test("profiles rest at the middle or full height; settings and logging out are sheets", async ({
    page,
    context,
  }) => {
    await signIn(context, await member({ username: uniqueName("sheet") }));
    await page.goto("/");
    await expect(page.locator("[data-explorer-drawer]")).toBeVisible();
    const height = page.viewportSize()!.height;
    const selector = '[data-panel-drawer="account"]';
    await openOwnProfile(page);
    const account = page.locator(selector);
    await expect(account.locator("[data-account-panel]")).toBeVisible();
    // Like a project, it opens at the middle height over the list…
    await expect(account).toHaveAttribute("data-snap", "partial");
    await expect
      .poll(() => top(page, selector))
      .toBeCloseTo(height * (1 - 0.58), -1);
    await shot(page, "mobile-own-profile-middle");
    // …and rises to the full height, with no folded height below the middle.
    await account.locator("[data-public-profile]").hover();
    await page.mouse.wheel(0, 200);
    await expect(account).not.toHaveAttribute("data-snap");
    await expect.poll(() => top(page, selector)).toBeLessThan(60);
    await shot(page, "mobile-own-profile-full");
    await account.getByRole("button", { name: "Lukk", exact: true }).click();
    await expect(account).toHaveCount(0);

    // Settings are a sheet from the menu, as the menu is.
    await page.getByRole("button", { name: "Konto", exact: true }).click();
    await accountMenuItem(page, "Kontoinnstillinger").click();
    const settings = page.getByRole("dialog", { name: "Kontoinnstillinger" });
    await expect(
      settings.getByRole("heading", { name: "Kontoinnstillinger" }),
    ).toBeVisible();
    await expect(account).toHaveCount(0);
    await shot(page, "mobile-account-settings");
    // Logging out asks how: here, or on every device.
    await settings.getByRole("button", { name: "Logg ut", exact: true }).click();
    const prompt = page.getByRole("dialog", { name: "Logg ut" });
    await expect(
      prompt.getByRole("button", { name: /^Logg ut på alle enheter/ }),
    ).toBeVisible();
    await shot(page, "mobile-sign-out");
    await prompt.getByRole("button", { name: "Logg ut", exact: true }).click();
    await expect(prompt).toHaveCount(0);
    await expect(settings).toHaveCount(0);
    await expect(page.getByText("Du er logget ut")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Logg inn", exact: true }).first(),
    ).toBeVisible();
  });

  test("Forslag opens as a drawer on its own URL", async ({ page, context }) => {
    const person = await member({ username: uniqueName("forslag") });
    await signIn(context, person);
    await page.goto("/forslag");
    const drawer = page.locator('[data-panel-drawer="suggestions"]');
    await expect(
      drawer.getByRole("heading", { name: "Mine forslag" }),
    ).toBeVisible();
    await expect(page.locator("[data-explorer-drawer]")).toBeVisible();
    await shot(page, "mobile-forslag-drawer");
    await drawer.getByRole("button", { name: "Lukk", exact: true }).click();
    await expect(drawer).toHaveCount(0);
    await expect(page).toHaveURL(/:\d+\/(\?|$)/);
  });

  test("Vis mindre floats over the post from the start", async ({ page }) => {
    // Short enough that the whole description runs past the fold.
    await page.setViewportSize({ width: 390, height: 420 });
    await page.goto(projectPath);
    const drawer = page.locator('[data-panel-drawer="project"]');
    await drawer.getByRole("button", { name: "Les mer", exact: true }).click();
    const less = drawer.getByRole("button", { name: "Vis mindre", exact: true });
    await expect(less).toHaveAttribute("data-stuck", "true");
  });

  test("Vis mindre turns into the floating pill as it slides there", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 390, height: 420 });
    await page.goto(projectPath);
    const drawer = page.locator('[data-panel-drawer="project"]');
    const toggle = drawer.locator('[aria-controls^="intro-"]');
    await toggle.click();
    // Stuck while it still slides, not once it lands.
    await expect(toggle).toHaveAttribute("data-moving", "true");
    expect(await toggle.getAttribute("data-stuck")).toBe("true");
    await expect(toggle).not.toHaveAttribute("data-moving");
    await expect(toggle).toHaveAttribute("data-stuck", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("data-stuck", "false");
    await expect(toggle).not.toHaveAttribute("data-moving");
    await expect(toggle).toHaveAccessibleName("Les mer");
  });
});

test.describe("desktop headers", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("a project's actions wait in its menu, beside the close button", async ({
    page,
  }) => {
    await page.goto(projectPath);
    const post = page.locator("[data-project-post]");
    await expect(post).toBeVisible();
    const actions = post.locator("[data-project-actions]");
    const menu = actions.getByRole("button", { name: "Flere valg" });
    await expect(menu).toBeVisible();
    // Nothing else shares the bar with the title.
    await expect(actions.getByRole("button")).toHaveCount(2);
    const box = (selector: string) =>
      post.locator(selector).first().evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, middle: rect.top + rect.height / 2 };
      });
    // The menu sits level with the close button.
    const close = await box("[data-project-close]");
    expect(Math.round((await box("[data-overflow-menu]")).middle)).toBe(
      Math.round(close.middle),
    );
    // The title's capitals sit level with them, as far below the panel's
    // top as they are in from its side.
    const title = await capitals(post.locator("#project-card-title"));
    expect(Math.abs(title.top - title.left)).toBeLessThanOrEqual(1);
    expect(title.top).toBeGreaterThanOrEqual(close.top);
    expect(title.bottom).toBeLessThanOrEqual(close.bottom);
    await shot(page, "desktop-project-header");

    await menu.click();
    const items = page.getByRole("menu").locator("[data-overflow-action]");
    await expect(items).toHaveText(["Lagre", "Foreslå endring", "Kopier lenke"]);
    await shot(page, "desktop-project-header-menu");
    await page.getByRole("menuitemcheckbox", { name: "Lagre" }).click();
    await expect(page.getByRole("dialog", { name: "Logg inn" })).toContainText(
      "lagre prosjekter",
    );
  });

  test("members suggest a change from under the intro", async ({
    page,
    context,
  }) => {
    await signIn(context, await member({ username: uniqueName("corrector") }));
    await page.goto(projectPath);
    const post = page.locator("[data-project-post]");
    const line = post.locator("[data-suggest-change]");
    await expect(line).toContainText("Ser du noe som er feil eller mangler?");
    await line.getByRole("button", { name: "Foreslå endring" }).click();
    await expect(post.getByRole("textbox", { name: "Prosjektnavn" })).toBeVisible();
  });

  test("the hint to suggest a change closes for one project", async ({
    page,
    context,
  }) => {
    await signIn(context, await member({ username: uniqueName("hinted") }));
    await page.goto(projectPath);
    const line = page.locator("[data-project-post] [data-suggest-change]");
    await expect(line).toBeVisible();
    await line.getByRole("button", { name: "Skjul forslag om endring" }).click();
    await expect(line).toHaveCount(0);
    await page.reload();
    await expect(page.locator("#project-card-title")).toBeVisible();
    await expect(line).toHaveCount(0);
    // Other projects still offer it.
    const other = seedProjects.find((item) => item.id !== project.id)!;
    await page.goto(`/prosjekt/${other.id}`);
    await expect(line).toBeVisible();
  });

  test("a project loaded on its own page stands out on the map", async ({
    page,
  }) => {
    await page.goto(projectPath);
    await expect(page.locator("[data-project-post]")).toBeVisible();
    const shape = page
      .locator(`path[data-project-id="${project.id}"]:not(.project-hit)`)
      .first();
    await expect(shape).toHaveClass(/is-selected/);
    await expect(shape).toHaveCSS("opacity", "1");
  });

  test("moderators delete a project from its menu, after asking", async ({
    page,
    context,
    request,
  }) => {
    const moderator = await member({
      username: uniqueName("delete_mod"),
      email: "delete-moderator@example.test",
    });
    const someone = await member({ username: uniqueName("delete_member") });
    const id = `test-project-${randomUUID()}`;
    const title = `Slettes ${id.slice(-6)}`;
    const fresh = { ...project, id, title, updates: [] };
    const post = (data: unknown, account = moderator) =>
      mutation(request, "/api/community", data, account);
    expect((await post({ action: "project", project: fresh, create: true })).ok()).toBe(true);
    expect(
      (await post({ action: "comment", projectId: id, text: "Hei" }, someone)).ok(),
    ).toBe(true);
    expect((await post({ action: "save", projectId: id, saved: true }, someone)).ok()).toBe(true);
    // Only moderators may delete.
    expect(
      (await post({ action: "delete-project", projectId: id }, someone)).status(),
    ).toBe(403);

    await signIn(context, moderator);
    await page.goto(`/prosjekt/${id}`);
    const panel = page.locator("[data-project-post]");
    await expect(panel.locator("#project-card-title")).toHaveText(title);
    await projectAction(page, "Slett prosjekt");
    const confirm = page.getByRole("dialog", { name: "Slette prosjektet?" });
    await expect(confirm).toContainText(title);
    await shot(page, "delete-project-confirm");
    // Cancelling keeps it.
    await confirm.getByRole("button", { name: "Avbryt" }).click();
    await expect(confirm).toHaveCount(0);
    await projectAction(page, "Slett prosjekt");
    await confirm.getByRole("button", { name: "Slett prosjekt" }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByText("Prosjektet er slettet")).toBeVisible();
    await expect(page).not.toHaveURL(/prosjekt/);
    await expect(page.getByText(title)).toHaveCount(0);

    // Gone for everyone, with its discussion and saves.
    const data = await (
      await request.get("/api/community", {
        headers: { Cookie: `${someone.cookie.name}=${someone.cookie.value}` },
      })
    ).json();
    expect(data.projects.some((item: { id: string }) => item.id === id)).toBe(false);
    expect(data.saved).not.toContain(id);
    expect(data.activity[id]).toBeUndefined();
    expect((await request.get(`/api/comments?project=${id}`)).ok()).toBe(true);
    expect(
      (await (await request.get(`/api/comments?project=${id}`)).json()).comments,
    ).toEqual([]);
    expect((await post({ action: "delete-project", projectId: id })).status()).toBe(404);
  });

  test("Lagret and Forslag carry their title where a project does", async ({
    page,
    context,
  }) => {
    await signIn(
      context,
      await member({ username: uniqueName("titled") }),
    );
    await page.goto(projectPath);
    const reference = await capitals(page.locator("#project-card-title"));
    const level = async (name: string) => {
      const panel = page.locator(`[data-sidebar-panel="${name}"]`);
      const title = await capitals(panel.getByRole("heading", { level: 1 }));
      const close = await panel
        .locator("[data-sidebar-close]")
        .evaluate((element) => element.getBoundingClientRect().top);
      expect(Math.abs(title.top - reference.top)).toBeLessThanOrEqual(1);
      expect(Math.abs(title.left - reference.left)).toBeLessThanOrEqual(1);
      expect(close).toBe(10);
    };
    await page.goto("/forslag");
    await expect(page.locator('[data-sidebar-panel="suggestions"]')).toBeVisible();
    await level("suggestions");
    await page.goto("/");
    await openSaved(page);
    await expect(page.locator('[data-sidebar-panel="saved"]')).toBeVisible();
    await level("saved");
    await shot(page, "desktop-saved-header");
  });
});

test.describe("flows stay in the explorer", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Forslag's link, signed out, asks to log in over the list", async ({
    page,
  }) => {
    await page.goto("/forslag");
    const prompt = page.getByRole("dialog", { name: "Logg inn" });
    await expect(prompt).toContainText("se forslag");
    await expect(page).toHaveURL(/:\d+\/(\?|$)/);
    await expect(
      page.getByRole("region", { name: "Prosjektliste", exact: true }),
    ).toBeVisible();
  });

  test("without a username, it is chosen over the page, in place", async ({
    page,
    context,
  }) => {
    await signIn(context, await member());
    await page.goto(projectPath);
    const prompt = page.getByRole("dialog", { name: "Hva skal vi kalle deg?" });
    await expect(prompt.getByLabel("Brukernavn", { exact: true })).toBeFocused();
    await expect(page.locator("[data-project-post]")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(projectPath));
  });

  test("signing out and own settings stay where they are", async ({
    page,
    context,
  }) => {
    const person = await member({ username: uniqueName("flow") });
    await signIn(context, person);
    // Settings open from the menu in the account panel, in place.
    await page.goto("/?kart=59.9100,10.7500,13");
    await page.getByRole("button", { name: "Konto", exact: true }).click();
    await accountMenuItem(page, "Kontoinnstillinger").click();
    const account = page.locator('[data-sidebar-panel="account"]');
    await expect(
      account.getByRole("heading", { name: "Kontoinnstillinger" }),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/\/konto/);
    await account.getByRole("button", { name: "Logg ut", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Logg ut?" })
      .getByRole("button", { name: "Logg ut", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Logg inn", exact: true }).first(),
    ).toBeVisible();
    await expect(account).toHaveCount(0);
    await expect(page.getByText("Du er logget ut")).toBeVisible();
    await expect(page).toHaveURL(/:\d+\/\?kart=59\.91/);
  });
});

test.describe("account menu", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the avatar opens a menu of one's own places, and logs out", async ({
    page,
    context,
  }) => {
    const person = await member({ username: uniqueName("menu") });
    await signIn(context, person);
    await page.goto("/?kart=59.9100,10.7500,13");
    const trigger = page.getByRole("button", { name: "Konto", exact: true });
    await trigger.click();
    const menu = page.getByRole("menu", { name: "Konto" });
    await expect(menu.getByRole("menuitem")).toHaveText([
      /Din profil$/,
      // Settings are an icon beside the profile.
      "",
      "Lagret",
      "Mine forslag",
      "Logg ut",
    ]);
    // Members have no moderator's view to leave; dark mode is the one switch.
    await expect(menu.getByRole("menuitemcheckbox")).toHaveText(["Mørk modus"]);
    await expect(
      menu.getByRole("menuitem", { name: "Kontoinnstillinger" }),
    ).toBeVisible();
    await shot(page, "account-menu");

    await menu.getByRole("menuitem", { name: "Kontoinnstillinger" }).click();
    const account = page.locator('[data-sidebar-panel="account"]');
    await expect(
      account.getByRole("heading", { name: "Kontoinnstillinger" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(account).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await trigger.click();
    await menu.getByRole("menuitem", { name: "Lagret" }).click();
    const saved = page.locator('[data-sidebar-panel="saved"]');
    await expect(saved).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(saved).toHaveCount(0);

    // Their own suggestions, and dark mode.
    await trigger.click();
    await menu.getByRole("menuitem", { name: "Mine forslag" }).click();
    await expect(page.locator('[data-sidebar-panel="suggestions"]')).toBeVisible();
    await page.keyboard.press("Escape");
    await trigger.click();
    await menu.getByRole("menuitemcheckbox", { name: "Mørk modus" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", /dark|light/);

    // Logging out asks first, and can log out every other device too.
    await trigger.click();
    await menu.getByRole("menuitem", { name: "Logg ut" }).click();
    const prompt = page.getByRole("dialog", { name: "Logg ut?" });
    await expect(
      prompt.getByRole("button", { name: "Logg ut", exact: true }),
    ).toBeFocused();
    await shot(page, "sign-out-prompt");
    await prompt
      .getByRole("checkbox", { name: /Logg ut på alle enheter/ })
      .check();
    await prompt.getByRole("button", { name: "Logg ut", exact: true }).click();
    await expect(prompt).toHaveCount(0);
    await expect(
      page.getByText("Du er logget ut på alle enheter"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Logg inn", exact: true }).first(),
    ).toBeVisible();
    await expect(page).toHaveURL(/:\d+\/\?kart=59\.91/);
  });

  test("moderators can view the app, and its rights, as a member", async ({
    page,
    context,
  }) => {
    const moderator = await member({
      username: uniqueName("menu_mod"),
      email: "menu-moderator@example.test",
    });
    await signIn(context, moderator);
    // Wide enough that every header action fits beside the others.
    await page.setViewportSize({ width: 1680, height: 900 });
    await page.goto("/");
    const list = page.getByRole("region", { name: "Prosjektliste" });
    const add = list.getByRole("button", { name: "Legg til prosjekt", exact: true });
    const suggest = list.getByRole("button", { name: "Foreslå prosjekt", exact: true });
    // The header keeps no adding or queue of its own: the list's end adds,
    // and the queue is in the avatar's menu, under moderator mode.
    const header = page.locator("[data-explorer-header]");
    await expect(add).toBeVisible();
    await expect(header.getByRole("button", { name: "Legg til prosjekt" })).toHaveCount(0);
    await expect(header.getByRole("link", { name: /^Forslag/ })).toHaveCount(0);
    const osm = () => page.request.get("/api/osm-candidates");
    expect((await osm()).status()).not.toBe(403);

    const trigger = page.getByRole("button", { name: "Konto", exact: true });
    const queue = accountMenuItem(page, /^Forslag/);
    await trigger.click();
    const toggle = accountMenuItem(page, "Moderatormodus");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(queue).toBeVisible();
    await toggle.click();
    await expect(add).toHaveCount(0);
    await expect(suggest).toBeVisible();
    // The server gives a member's rights too, and keeps them over reloads.
    expect((await osm()).status()).toBe(403);
    await page.reload();
    await expect(suggest).toBeVisible();
    await trigger.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(queue).toHaveCount(0);

    await toggle.click();
    await expect(add).toBeVisible();
    expect((await osm()).status()).not.toBe(403);
    await trigger.click();
    await queue.click();
    await expect(page.locator('[data-sidebar-layer="suggestions"]')).toBeVisible();
  });
});

test.describe("mobile project actions, signed in", () => {
  test.use({
    viewport: devices["iPhone 13"].viewport,
    userAgent: devices["iPhone 13"].userAgent,
    hasTouch: true,
    isMobile: true,
  });

  test("nothing is locked, and saving works from the sheet", async ({
    page,
    context,
  }) => {
    await signIn(context, await member({ username: uniqueName("sheet") }));
    await page.goto(projectPath);
    const drawer = page.locator('[data-panel-drawer="project"]');
    await expect(drawer.locator("[data-project-post]")).toBeVisible();
    const menu = drawer.getByRole("button", { name: "Handlinger" });
    await menu.click();
    const actions = page.getByRole("dialog", { name: "Handlinger" });
    await expect(actions.locator("[data-locked]")).toHaveCount(0);
    await actions.getByRole("button", { name: "Lagre", exact: true }).click();
    await expect(actions).toHaveCount(0);
    await expect(menu).toBeFocused();
    await menu.click();
    await expect(
      actions.getByRole("button", { name: "Fjern fra lagrede", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(actions).toHaveCount(0);
    await expect(drawer.locator("[data-project-post]")).toBeVisible();
  });

  test("the account sheet swipes away by itself, not the drawer behind it", async ({
    page,
    context,
  }) => {
    await signIn(context, await member({ username: uniqueName("swipe") }));
    await page.goto("/");
    const drawer = page.locator("[data-explorer-drawer]");
    await expect(drawer).toBeVisible();
    const top = () => drawer.evaluate((e) => e.getBoundingClientRect().top);
    const before = await top();
    const trigger = page.getByRole("button", { name: "Konto", exact: true });
    await trigger.click();
    const sheet = page.getByRole("dialog", { name: "Konto" });
    // From the top row, so the swipe runs the sheet's full height.
    await swipeDown(page, sheet.getByRole("button", { name: /Din profil/ }));
    await expect(sheet).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await top()).toBeCloseTo(before, 0);
  });
});
