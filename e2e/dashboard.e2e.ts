import { expect, test } from "@playwright/test";

test.describe("ops dashboard (demo workspace)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Operations overview" })).toBeVisible();
  });

  test("shows live-derived metrics instead of the old hardcoded GPS demo", async ({ page }) => {
    await expect(page.getByText("Demo workspace")).toBeVisible();
    for (const label of ["Fleet", "On rent now", "Overdue", "Pickups today"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText("7 available · 1 in maintenance")).toBeVisible();
    // Parked GPS surfaces must not appear on the rental dashboard.
    await expect(page.getByText("Vehicles moving")).toHaveCount(0);
    await expect(page.getByText("Tracker alerts")).toHaveCount(0);
    await expect(page.getByText("Monday · 13 July 2026")).toHaveCount(0);
  });

  test("lists today's returns and the overdue rental", async ({ page }) => {
    const dueBack = page.locator("section").filter({ has: page.getByText("Due back today", { exact: true }) });
    await expect(dueBack.getByRole("row")).toHaveCount(3); // header + 2 returns
    const attention = page.getByText("Needs attention").locator("xpath=ancestor::*[@data-slot='card'][1]");
    await expect(attention.getByText(/^overdue$/i)).toBeVisible();
    await expect(attention.getByText(/late$/).first()).toBeVisible();
  });

  test("opens a rental from the attention list", async ({ page }) => {
    const attention = page.getByText("Needs attention").locator("xpath=ancestor::*[@data-slot='card'][1]");
    await attention.getByRole("link").first().click();
    await expect(page).toHaveURL(/\/rentals\/demo-rental-\d+$/);
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Rentals");
  });

  test("links to analytics from the header and the month-to-date card", async ({ page }) => {
    await expect(page.getByText("Month to date")).toBeVisible();
    await page.getByRole("link", { name: "Open analytics" }).click();
    await expect(page).toHaveURL(/\/analytics$/);
    await expect(page.getByRole("heading", { name: "Analytics", level: 1 })).toBeVisible();
  });
});
