import { expect, test, type Page } from "@playwright/test";

/** The month before today's Manila month, as react-day-picker names it. */
function previousMonthName() {
  const manila = new Date(Date.now() + 8 * 3_600_000);
  const month = new Date(Date.UTC(manila.getUTCFullYear(), manila.getUTCMonth() - 1, 1));
  return month.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
}

async function pickPastDateTime(page: Page, id: string, day: number) {
  await page.locator(`#${id}`).click();
  await page.getByRole("button", { name: /previous month/i }).click();
  await page
    .getByRole("button", { name: new RegExp(`${previousMonthName()} ${day}(st|nd|rd|th)`) })
    .first()
    .click();
  // Opening the time wheel and pressing Done keeps the 9:00 AM it shows.
  await page.locator(`#${id}-time`).click();
  await page.getByRole("button", { name: "Done" }).click();
}

test.describe("record past rental", () => {
  test("is offered on the rentals list", async ({ page }) => {
    await page.goto("/rentals");
    await page.getByRole("link", { name: "Record past rental" }).click();
    await expect(page).toHaveURL(/\/rentals\/past$/);
    await expect(page.getByRole("heading", { name: "Record past rental", level: 1 })).toBeVisible();
  });

  test("names what is missing instead of previewing", async ({ page }) => {
    await page.goto("/rentals/past");
    await page.getByRole("button", { name: "Preview before saving" }).click();
    await expect(page.getByText("Fix the highlighted fields to see the preview.")).toBeVisible();
    await expect(page.getByText("Select the customer.")).toBeVisible();
    await expect(page.getByText("Enter the pickup date and time.")).toBeVisible();
  });

  test("previews exactly what will be saved, and saving needs the acknowledgement", async ({ page }) => {
    await page.goto("/rentals/past");
    await page.locator("#past-customer").click();
    await page.getByRole("option").first().click();
    await page.locator("#past-car").click();
    await page.getByRole("option", { name: /NCR 1842/ }).click();
    await pickPastDateTime(page, "past-start", 5);
    await pickPastDateTime(page, "past-expected", 7);
    await page.getByLabel("Amount paid (PHP)").fill("1000");

    await page.getByRole("button", { name: "Preview before saving" }).click();
    await expect(page.getByText("Check before saving")).toBeVisible();
    // NCR 1842 rents at ₱2,000 a day; two days out.
    await expect(page.getByText("₱4,000.00").first()).toBeVisible();
    await expect(page.getByText("₱3,000.00", { exact: true })).toBeVisible(); // balance owed
    await expect(page.getByText("No pickup or return inspection will be on record", { exact: false })).toBeVisible();

    const save = page.getByRole("button", { name: "Save past rental" });
    await expect(save).toBeDisabled();
    await page.getByText("I checked these details and confirm", { exact: false }).click();
    await expect(save).toBeEnabled();

    // Back keeps what was typed.
    await page.getByRole("button", { name: "Back to edit" }).click();
    await expect(page.getByLabel("Amount paid (PHP)")).toHaveValue("1000");
    await page.getByRole("button", { name: "Preview before saving" }).click();
    // A fresh preview asks for the acknowledgement again.
    await expect(page.getByRole("button", { name: "Save past rental" })).toBeDisabled();
    await page.getByText("I checked these details and confirm", { exact: false }).click();
    await page.getByRole("button", { name: "Save past rental" }).click();
    // Demo mode never writes; the message proves the action ran.
    await expect(page.getByText("Connect Supabase to record rentals.")).toBeVisible();
  });
});
