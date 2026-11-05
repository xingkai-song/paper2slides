import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import JSZip from "jszip";
test("demo edits, undo/redo, full restore, original figure and editable PPTX", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /让研究/ })).toBeVisible();
  await page.getByRole("button", { name: "打开示例", exact: false }).click();
  await expect(page.getByRole("button", { name: "导出 PPTX" })).toBeVisible();
  await expect(page.locator(".slide-thumb")).toHaveCount(6);
  await page.locator(".slide-thumb").nth(2).click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "文字", exact: true }).click();
  const text = page.getByRole("textbox", { name: "元素文字" });
  await text.fill("An edited source-based presentation");
  await expect(text).toHaveValue("An edited source-based presentation");
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(text).toHaveValue("输入文字");
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect(text).toHaveValue("An edited source-based presentation");
  await expect(page.locator(".save-state")).toContainText("已保存", {
    timeout: 15000,
  });
  await page.reload();
  await page.locator(".project-open").first().click();
  await expect(page.locator(".slide-thumb")).toHaveCount(6);
  await page.locator(".slide-thumb").nth(2).click();
  await page.getByRole("button", { name: "查看原论文", exact: false }).click();
  await expect(page.getByAltText("论文 PDF 第 2 页")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 PPTX" }).click();
  if (await page.getByRole("button", { name: "仍然导出" }).isVisible())
    await page.getByRole("button", { name: "仍然导出" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  const bytes = await readFile(path!);
  await mkdir(".local", { recursive: true });
  await writeFile(".local/demo-export.pptx", bytes);
  const zip = await JSZip.loadAsync(bytes);
  const slideXml = await zip.file("ppt/slides/slide3.xml")!.async("string");
  expect(slideXml).toContain("An edited source-based presentation");
  expect(slideXml).toContain("<p:pic>");
  expect(
    Object.keys(zip.files).filter((x) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(x),
    ),
  ).toHaveLength(6);
  await page.screenshot({ path: "test-results/editor.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("upload parses a PDF but local mode never pretends to run real AI", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles("public/demo.pdf");
  await expect(
    page.getByRole("button", { name: "识别正文范围", exact: false }),
  ).toBeDisabled({ timeout: 20000 });
  await expect(page.getByRole("alert")).toContainText("本地预览");
  await expect(
    page.getByRole("heading", { name: /我们读的是正文/ }),
  ).toBeVisible();
});
