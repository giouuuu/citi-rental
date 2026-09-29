import { expect, test } from "@playwright/test";

test.describe("customer rental history", () => {
  test("shows the track record and every rental", async ({ page }) => {
    await page.goto("/customers/demo-customer");
    await expect(page.getByRole("heading", { name: "Mika Santos", level: 1 })).toBeVisible();
    await page.getByRole("tab", { name: "Rentals" }).click();
    await expect(page).toHaveURL(/tab=rentals/);

    for (const label of ["Rentals", "Lifetime value", "Owes", "Late returns", "Average rental", "Customer since"]) {
      await expect(page.locator("dt", { hasText: label })).toBeVisible();
    }
    const rows = page.getByRole("table").getByRole("row");
    expect(await rows.count()).toBeGreaterThan(5);

    await page.getByRole("table").getByRole("link").first().click();
    await expect(page).toHaveURL(/\/rentals\/demo-rental-\d+/);
  });

  test("a customer with no rentals gets the empty state", async ({ page }) => {
    // The blocked demo customer is never picked for a rental.
    await page.goto("/customers/demo-customer-14?tab=rentals");
    await expect(page.getByText("No rentals yet")).toBeVisible();
  });
});
