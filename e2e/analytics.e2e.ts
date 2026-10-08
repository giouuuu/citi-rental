import { expect, test, type Page } from "@playwright/test";

async function pickOption(page: Page, label: string, option: string) {
  await page.getByLabel(label).click();
  await page.getByRole("option", { name: option }).click();
}

function manilaDateKey(offsetDays = 0) {
  const shifted = new Date(Date.now() + 8 * 3_600_000 + offsetDays * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

test.describe("analytics", () => {
  test("Overview shows headline numbers and charts; each tab shows its own slice", async ({ page }) => {
    await page.goto("/analytics");
    await expect(page.getByRole("heading", { name: "Analytics", level: 1 })).toBeVisible();
    await expect(page.getByText(/\(30 days, Manila time\)/)).toBeVisible();
    await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");

    for (const label of ["Collected revenue", "Bookings", "Fleet utilization", "Outstanding balance", "Cancellation rate", "Late returns", "Average rental", "Charges billed"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText(/vs previous period/).first()).toBeVisible();

    // Collected, bookings, utilization, and booked-ahead charts.
    await expect(page.locator(".recharts-surface")).toHaveCount(4);
    await expect(page.getByText("Booked ahead")).toBeVisible();
    // Other tabs' panels are not rendered on Overview.
    await expect(page.getByText("Performance by car", { exact: true })).toHaveCount(0);

    await page.getByRole("tab", { name: "Cars" }).click();
    await expect(page).toHaveURL(/tab=cars/);
    await expect(page.getByText("Performance by car", { exact: true })).toBeVisible();
    const idle = page.getByText("Sitting idle").locator("xpath=ancestor::*[@data-slot='card'][1]");
    await expect(idle.getByText("SED 4417 · Toyota Vios 02")).toBeVisible();
    await expect(page.getByText("Collected revenue", { exact: true })).toHaveCount(0);
    // Cars has no charts, so there is nothing to group.
    await expect(page.getByLabel("Group by")).toHaveCount(0);

    await page.getByRole("tab", { name: "Customers" }).click();
    await expect(page).toHaveURL(/tab=customers/);
    await expect(page.getByText("Top customers", { exact: true })).toBeVisible();
    await expect(page.getByText("First-time", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Website & Facebook" }).click();
    await expect(page).toHaveURL(/tab=website/);
    await expect(page.getByText("On the site now")).toBeVisible();
    await expect(page.getByText("Open → book", { exact: true })).toBeVisible();
    await expect(page.getByText("Most viewed cars", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Group by")).toBeVisible();

    await page.getByRole("tab", { name: "Overview" }).click();
    await expect(page).not.toHaveURL(/tab=/);
    await expect(page.getByText("Booked ahead")).toBeVisible();
  });

  test("the tab survives a period change and the period survives a tab change", async ({ page }) => {
    await page.goto("/analytics?tab=website");
    await pickOption(page, "Period", "Last 90 days");
    await expect(page).toHaveURL(/range=90d/);
    await expect(page).toHaveURL(/tab=website/);

    await page.getByRole("tab", { name: "Cars" }).click();
    await expect(page).toHaveURL(/range=90d/);
    await expect(page.getByText(/\(90 days, Manila time\)/)).toBeVisible();
  });

  test("changing the period updates the URL and keeps the page", async ({ page }) => {
    await page.goto("/analytics");
    await pickOption(page, "Period", "Last 90 days");
    await expect(page).toHaveURL(/range=90d/);
    await expect(page.getByText(/\(90 days, Manila time\)/)).toBeVisible();
    await expect(page.getByLabel("Group by")).toContainText("Automatic (weekly)");

    await pickOption(page, "Group by", "Monthly");
    await expect(page).toHaveURL(/bucket=month/);

    await pickOption(page, "Period", "Last 30 days");
    await expect(page).not.toHaveURL(/range=/);
    await expect(page).toHaveURL(/bucket=month/);
  });

  test("a custom date range pins both ends in the URL", async ({ page }) => {
    await page.goto("/analytics");
    const from = manilaDateKey(-59);
    // Typed dates are a draft until Apply.
    await page.getByLabel("Period").click();
    await page.getByLabel("Start date").fill(from);
    await page.getByLabel("End date").fill(manilaDateKey());
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(new RegExp(`from=${from}&to=${manilaDateKey()}`));
    await expect(page.getByText(/\(60 days, Manila time\)/)).toBeVisible();
  });

  test("a malformed link falls back to the default window", async ({ page }) => {
    await page.goto("/analytics?range=5y&from=nope&bucket=hour");
    await expect(page.getByText(/\(30 days, Manila time\)/)).toBeVisible();
    await expect(page.getByLabel("Group by")).toContainText("Automatic (daily)");
  });

  test("each chart has a data-table twin", async ({ page }) => {
    await page.goto("/analytics");
    const revenue = page.getByText("Collected revenue", { exact: true }).nth(1).locator("xpath=ancestor::*[@data-slot='card'][1]");
    await revenue.getByText("Show data table").click();
    await expect(revenue.getByRole("columnheader", { name: "Collected" })).toBeVisible();
    await expect(revenue.getByRole("row")).toHaveCount(31); // header + 30 days
  });

  test("hovering a bar shows a formatted tooltip", async ({ page }) => {
    await page.goto("/analytics");
    // Hover the tallest part of a real bar, not whatever day sits mid-chart.
    const bar = page.locator(".recharts-bar-rectangle path").first();
    await bar.hover();
    await expect(page.locator(".recharts-tooltip-wrapper").first()).toContainText("₱");
  });

  test("a top customer opens their rental history", async ({ page }) => {
    await page.goto("/analytics?tab=customers");
    const table = page.getByText("Top customers", { exact: true }).locator("xpath=ancestor::*[@data-slot='card'][1]");
    const first = table.getByRole("link").first();
    const name = (await first.textContent())!.trim();
    await first.click();
    await expect(page).toHaveURL(/\/customers\/demo-customer[-\d]*\?tab=rentals/);
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
    await expect(page.getByText("Rental history")).toBeVisible();
    await expect(page.getByText("Lifetime value")).toBeVisible();
  });

  test("the sidebar has Analytics and Reports under Overview", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Analytics" }).first().click();
    await expect(page).toHaveURL(/\/analytics/);
  });
});

test.describe("analytics on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("has no horizontal page scroll on any tab", async ({ page }) => {
    for (const [tab, marker] of [
      ["overview", "Booked ahead"],
      ["website", "Most viewed cars"],
      ["cars", "Performance by car"],
      ["customers", "Top customers"],
    ] as const) {
      await page.goto(tab === "overview" ? "/analytics" : `/analytics?tab=${tab}`);
      await expect(page.getByText(marker, { exact: true }).first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, tab).toBeLessThanOrEqual(0);
    }
  });
});
