import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
for (const name of ["attention", "lora", "rag"])
  test(`parse real ${name} PDF without truncating pages`, async ({ page }) => {
    test.skip(
      !existsSync(`.local/${name}.pdf`),
      "Public test paper not downloaded",
    );
    await page.goto("/");
    await page.locator("input[type=file]").setInputFiles(`.local/${name}.pdf`);
    await expect(
      page.getByRole("heading", { name: /我们读的是正文/ }),
    ).toBeVisible({ timeout: 45000 });
    await expect(page.getByRole("alert")).toContainText("本地预览");
    await expect(page.getByRole("spinbutton", { name: "PDF页码" })).toHaveValue(
      "1",
    );
    await page.getByText("检查本页提取文字").click();
    await expect(
      page.getByRole("textbox", { name: "提取文字" }),
    ).not.toBeEmpty();
  });
