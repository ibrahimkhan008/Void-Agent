import { expect, test } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

test.describe("Chat workspace", () => {
  test.use({ storageState: TEST_USERS.editor.authFile });

  test("switches between Chat and Agent and redirects the retired cockpit URL", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("tab", { name: "Chat" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Agent" })).toBeVisible();
    await expect(page.getByText("Cockpit")).toHaveCount(0);

    await page.getByRole("tab", { name: "Agent" }).click();
    await expect(page).toHaveURL(/\/cloud-agent$/);
    await expect(page.getByRole("tab", { name: "Agent" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await page.goto("/cockpit");
    await expect(page).toHaveURL(/\/$/);
  });
});
