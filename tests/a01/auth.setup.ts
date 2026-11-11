import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test as setup } from "@playwright/test";
import { TEST_USERS } from "../constants/test-users";

const authStatePath = resolve(
  process.cwd(),
  ".audit/a01-playwright/regular-user.json",
);

setup("sign in with the seeded regular A01 test user", async ({ page }) => {
  mkdirSync(dirname(authStatePath), { recursive: true });
  await page.goto("/sign-in");
  await page.getByPlaceholder("Email address").fill(TEST_USERS.regular.email);
  await page.getByPlaceholder("Password").fill(TEST_USERS.regular.password);
  await page.getByRole("button", { name: /Welcome Back/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), {
    timeout: 15_000,
  });
  expect(page.url()).not.toContain("/sign-in");
  await page.context().storageState({ path: authStatePath });
});
