import type { Platform, Project, ProjectSummary } from "../types";
import { recoveryDelete } from "./platform";
export class Repository {
  etag = new Map<string, string>();
  last = new Map<string, ProjectSummary>();
  private queues = new Map<string, Promise<unknown>>();
  constructor(public platform: Platform) {}
  async list() {
    const rows = await this.platform.list("projects/");
    const summaries: ProjectSummary[] = [];
    for (const { key } of rows) {
      const r = await this.platform.get(key);
      if (r.exists) {
        const s = r.value as ProjectSummary;
        this.etag.set(s.id, r.etag || "");
        this.last.set(s.id, s);
        summaries.push(s);
      }
    }
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async load(id: string) {
    const r = await this.platform.get("projects/" + id);
    if (!r.exists) throw new Error("项目不存在");
    const s = r.value as ProjectSummary;
    this.etag.set(id, r.etag || "");
    this.last.set(id, s);
    let p: Project;
    try {
      p = JSON.parse(await (await this.platform.blob(s.path)).text());
    } catch (e) {
      if (!s.previousPath) throw e;
      p = JSON.parse(await (await this.platform.blob(s.previousPath)).text());
      p.warnings.push("最新快照无法读取，已恢复上一版本。");
    }
    if (p.schemaVersion !== 1)
      throw new Error("项目版本不兼容，未修改原数据。请更新应用。");
    return p;
  }
  save(p: Project): Promise<ProjectSummary> {
    const snapshot = structuredClone(p);
    const before = this.queues.get(p.id) || Promise.resolve();
    const next = before.catch(() => {}).then(() => this.commit(snapshot));
    this.queues.set(p.id, next);
    return next;
  }
  private async commit(p: Project) {
    const path = `projects/${p.id}/snapshots/${p.revision}-${crypto.randomUUID()}.json`;
    await this.platform.upload(
      path,
      new Blob([JSON.stringify(p)], { type: "application/json" }),
    );
    const previous = this.last.get(p.id);
    const summary: ProjectSummary = {
      id: p.id,
      name: p.name,
      updatedAt: p.updatedAt,
      stage: p.stage,
      pageCount: p.range ? p.range.end - p.range.start + 1 : p.pages.length,
      slideCount: p.slides.length,
      cu: p.usage.reduce((s, u) => s + u.cu, 0),
      path,
      previousPath: previous?.path,
    };
    const r = await this.platform.set(
      "projects/" + p.id,
      summary,
      this.etag.get(p.id) || undefined,
    );
    this.etag.set(p.id, r.etag || "");
    this.last.set(p.id, summary);
    if (previous?.previousPath)
      try {
        await this.platform.deleteFile(previous.previousPath);
      } catch {
        /* Next project cleanup retries orphan snapshots. */
      }
    return summary;
  }
  async remove(id: string) {
    await this.queues.get(id)?.catch(() => {});
    const paths = await this.platform.listFiles("projects/" + id + "/");
    const failures: string[] = [];
    for (const path of paths)
      try {
        await this.platform.deleteFile(path);
      } catch {
        failures.push(path);
      }
    if (failures.length)
      throw new Error(
        `${failures.length} 个文件删除失败，项目仍保留，请重试删除。`,
      );
    await this.platform.remove("projects/" + id);
    await recoveryDelete(id);
    this.last.delete(id);
    this.etag.delete(id);
  }
  async copy(p: Project) {
    const id = crypto.randomUUID();
    const clone = structuredClone(p);
    clone.id = id;
    clone.name += "（副本）";
    clone.createdAt = clone.updatedAt = new Date().toISOString();
    clone.revision = 0;
    delete clone.exported;
    const all = [
      p.pdfPath,
      ...p.figures.flatMap((f) => (f.assetPath ? [f.assetPath] : [])),
    ];
    const mapping = new Map<string, string>();
    for (const old of new Set(all)) {
      const path = `projects/${id}/assets/${crypto.randomUUID()}-${old.split("/").pop()}`;
      await this.platform.upload(path, await this.platform.blob(old));
      mapping.set(old, path);
    }
    clone.pdfPath = mapping.get(p.pdfPath)!;
    clone.figures.forEach((f) => {
      if (f.assetPath) f.assetPath = mapping.get(f.assetPath);
    });
    for (const s of [...clone.slides, ...Object.values(clone.generated)])
      s.elements.forEach((e) => {
        if (e.assetPath) e.assetPath = mapping.get(e.assetPath);
      });
    await this.save(clone);
    return clone;
  }
}
