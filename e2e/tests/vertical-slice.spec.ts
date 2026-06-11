import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  FIXTURE_PAGE_BODY,
  FIXTURE_PAGE_TITLE,
  FIXTURE_PAGE_URL,
} from "../stack.js";

const UPLOAD_FILENAME = "e2e-note.txt";
const UPLOAD_CONTENT =
  "End-to-end uploaded evidence file. Deterministic bytes for hashing.\n";

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

const UPLOAD_SHA256 = sha256(UPLOAD_CONTENT);
const FIXTURE_SHA256 = sha256(FIXTURE_PAGE_BODY);

// Reads a definition-list value from a provenance/job drawer by its term.
function detailValue(drawer: Locator, term: string): Locator {
  return drawer
    .locator("div", { has: drawer.page().locator(`dt:text-is("${term}")`) })
    .locator("dd");
}

async function openCaseTab(page: Page, label: string) {
  await page
    .getByRole("navigation", { name: "Case sections" })
    .getByRole("link", { name: label })
    .click();
}

// The ten steps from the delivery plan's end-to-end strategy (§8), in order,
// against the seeded owner account and a local fixture web server. Nothing in
// this suite touches the public internet.
test("first usable vertical slice end to end", async ({ page }) => {
  const email = process.env.SEED_OWNER_EMAIL ?? "owner@evidara.test";
  const password = process.env.SEED_OWNER_PASSWORD ?? "test-owner-password";

  await test.step("1. sign in", async () => {
    await page.goto("/login");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/cases");
  });

  await test.step("2. create a case", async () => {
    await page.getByRole("link", { name: "New case" }).click();
    await page.locator("#case-name").fill("E2E vertical slice case");
    await page
      .locator("#case-objective")
      .fill("Exercise the complete collection workflow end to end.");
    await page
      .locator("#case-scope")
      .fill("Local fixture servers and seeded accounts only.");
    await page
      .locator("#case-justification")
      .fill("Automated verification of the first usable vertical slice.");
    await page.getByRole("button", { name: "Create case" }).click();
    await page.waitForURL("**/overview");
  });

  await test.step("3. add manual evidence", async () => {
    await openCaseTab(page, "Sources");
    await page.getByRole("button", { name: "Add manual evidence" }).click();
    await page.locator("#manual-title").fill("Manual field note");
    await page
      .locator("#manual-description")
      .fill("Observation recorded without a binary object.");
    await page.getByRole("button", { name: "Add evidence" }).click();
    await expect(
      page.getByRole("button", { name: "Manual field note" }),
    ).toBeVisible();
  });

  await test.step("4. upload a text file", async () => {
    await page.getByRole("button", { name: "Upload file" }).click();
    await page.locator("#upload-file").setInputFiles({
      name: UPLOAD_FILENAME,
      mimeType: "text/plain",
      buffer: Buffer.from(UPLOAD_CONTENT),
    });
    await page.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(
      page.getByRole("button", { name: UPLOAD_FILENAME }),
    ).toBeVisible();
  });

  await test.step("5. verify the source register and hash", async () => {
    await page.getByRole("button", { name: UPLOAD_FILENAME }).click();
    const drawer = page.getByRole("dialog", { name: "Evidence provenance" });
    await expect(drawer).toBeVisible();
    await expect(detailValue(drawer, "SHA-256")).toHaveText(UPLOAD_SHA256);
    await expect(detailValue(drawer, "Size")).toContainText(
      `${Buffer.byteLength(UPLOAD_CONTENT)} bytes`,
    );
    await expect(detailValue(drawer, "Detected content type")).toHaveText(
      "text/plain",
    );
    await drawer.getByRole("button", { name: "Close" }).click();
  });

  await test.step("6. queue a fixture web capture", async () => {
    await openCaseTab(page, "Jobs");
    await page.getByRole("button", { name: "Capture web page" }).click();
    await page.locator("#capture-url").fill(FIXTURE_PAGE_URL);
    await page.getByRole("button", { name: "Queue capture" }).click();
    await expect(
      page.getByRole("button", { name: FIXTURE_PAGE_URL }),
    ).toBeVisible();
  });

  await test.step("7. observe terminal job success", async () => {
    const row = page.locator("tr", {
      has: page.getByRole("button", { name: FIXTURE_PAGE_URL }),
    });
    // The UI polls active jobs every four seconds until they reach a
    // terminal state.
    await expect(row.locator(".pill").first()).toHaveText("Succeeded", {
      timeout: 60_000,
    });
    await expect(
      row.getByRole("link", { name: "Evidence captured" }),
    ).toBeVisible();

    await page.getByRole("button", { name: FIXTURE_PAGE_URL }).click();
    const drawer = page.getByRole("dialog", { name: "Connector job details" });
    await expect(drawer.locator(".attemptList li")).toContainText("succeeded");
    await drawer.getByRole("button", { name: "Close" }).click();
  });

  await test.step("8. open the captured page's provenance", async () => {
    await openCaseTab(page, "Sources");
    await page.getByRole("button", { name: FIXTURE_PAGE_TITLE }).click();
    const drawer = page.getByRole("dialog", { name: "Evidence provenance" });
    await expect(detailValue(drawer, "SHA-256")).toHaveText(FIXTURE_SHA256);
    await expect(detailValue(drawer, "Source URL")).toHaveText(
      FIXTURE_PAGE_URL,
    );
    await expect(detailValue(drawer, "Collection method")).toHaveText(
      "web-page-capture",
    );
    await drawer.getByRole("button", { name: "Close" }).click();
  });

  await test.step("9. download authorized evidence", async () => {
    await page.getByRole("button", { name: UPLOAD_FILENAME }).click();
    const drawer = page.getByRole("dialog", { name: "Evidence provenance" });
    const downloadPromise = page.waitForEvent("download");
    await drawer.getByRole("button", { name: "Download original" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(UPLOAD_FILENAME);
    const downloadPath = await download.path();
    expect(sha256(await readFile(downloadPath))).toBe(UPLOAD_SHA256);
    await drawer.getByRole("button", { name: "Close" }).click();
  });

  await test.step("10. confirm the audit timeline", async () => {
    await openCaseTab(page, "Audit");
    const timeline = page.locator(".auditTimeline");
    await expect(timeline).toBeVisible();
    for (const label of [
      "Case created",
      "Evidence added",
      "Collection queued",
      "Collection succeeded",
      "Evidence downloaded",
    ]) {
      await expect(timeline.getByText(label).first()).toBeVisible();
    }
  });
});
