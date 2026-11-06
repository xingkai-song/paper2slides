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

test("pending figures explain disabled generation and require an actual crop", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "打开示例", exact: false }).click();
  await expect(page.getByRole("button", { name: "导出 PPTX" })).toBeVisible();
  await page.evaluate(async () => {
    // Seed a real UI state through the same store, without invoking paid models.
    // @ts-expect-error Vite serves this module in the local test app.
    const { useApp } = await import("/src/store.ts");
    const p = useApp.getState().project;
    useApp.getState().patch({
      stage: "outline",
      figures: [
        {
          ...p.figures[0],
          id: "pending-qa",
          selected: true,
          confirmed: false,
          located: false,
          assetPath: undefined,
          locationStatus: "manual",
          slideId: p.outline[0].id,
        },
      ],
    });
  });
  await expect(page.getByText("还有 1 张图表待核验。")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /生成 \d+ 页 PPT/ }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "去核验第一张" }).click();
  await expect(page.locator("#figure-pending-qa")).toBeFocused();
  await page
    .getByRole("button", { name: "框选图表并确认", exact: true })
    .click();
  await expect(page.locator(".pdf-page img")).toBeVisible();
  const confirm = page.getByRole("button", {
    name: "确认裁剪并插入",
    exact: true,
  });
  await expect(confirm).toBeDisabled();
  const box = await page.locator(".pdf-page").boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width * 0.1, box!.y + box!.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.8, box!.y + box!.height * 0.4, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(confirm).toBeEnabled();
});
