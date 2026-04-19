import { test, expect } from "@playwright/test";

const PASSCODE = process.env.ADMIN_PASSCODE ?? "unicron";

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(new URL("/gate", baseURL).toString());
  await page.getByPlaceholder("passcode").fill(PASSCODE);
  await page.getByRole("button", { name: /enter/i }).click();
  await page.waitForURL(/\/app/);
});

test("landing page renders", async ({ page, baseURL }) => {
  await page.goto(baseURL!, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(/Unicron/);
});

test("meta dashboard shows 5 pattern tiles", async ({ page, baseURL }) => {
  await page.goto(new URL("/app", baseURL).toString());
  await expect(page.getByRole("heading", { name: "Pattern Suite" })).toBeVisible();
  for (const label of ["Mycelium", "Beehive", "Ant Colony", "Murmuration", "Slime Mold"]) {
    await expect(page.getByRole("heading", { name: label })).toBeVisible();
  }
});

test("mycelium page loads with topics sidebar", async ({ page, baseURL }) => {
  await page.goto(new URL("/app/mycelium", baseURL).toString());
  await expect(page.getByRole("heading", { name: /Mycelium/i })).toBeVisible();
  await expect(page.getByText(/topics/i).first()).toBeVisible();
});

test("beehive page has URL selector + run button", async ({ page, baseURL }) => {
  await page.goto(new URL("/app/beehive", baseURL).toString());
  await expect(page.getByRole("heading", { name: /Beehive/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Run pipeline/i })).toBeVisible();
});

test("colony page has market selector + dispatch", async ({ page, baseURL }) => {
  await page.goto(new URL("/app/colony", baseURL).toString());
  await expect(page.getByRole("heading", { name: /Ant Colony/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Dispatch swarm/i })).toBeVisible();
});

test("murmuration page has prompt + run flock button", async ({ page, baseURL }) => {
  await page.goto(new URL("/app/murmuration", baseURL).toString());
  await expect(page.getByRole("heading", { name: /Murmuration/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Run flock/i })).toBeVisible();
});

test("slime page has seed + cycle buttons", async ({ page, baseURL }) => {
  await page.goto(new URL("/app/slime", baseURL).toString());
  await expect(page.getByRole("heading", { name: /Slime Mold/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Seed selection/i })).toBeVisible();
});
