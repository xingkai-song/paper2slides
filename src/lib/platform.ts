import { openDB } from "idb";
import type { Platform, CompletionRequest, Usage } from "../types";
const db = () =>
  openDB("paper2slides-v1", 1, {
    upgrade(d) {
      d.createObjectStore("kv");
      d.createObjectStore("files");
      d.createObjectStore("recovery");
    },
  });
export async function recoveryPut(id: string, value: unknown) {
  const d = await db();
  await d.put("recovery", value, id);
}
export async function recoveryGet(id: string) {
  return (await db()).get("recovery", id);
}
export async function recoveryDelete(id: string) {
  return (await db()).delete("recovery", id);
}
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function localPlatform(): Platform {
  return {
    kind: "local",
    async complete() {
      throw new Error(
        "当前为本地预览。真实 AI 需要从 Anna 打开应用，或通过 Anna 开发环境连接。",
      );
    },
    async get(key) {
      const v = await (await db()).get("kv", key);
      return v
        ? { exists: true, value: v.value, etag: v.etag }
        : { exists: false, value: null };
    },
    async set(key, value, etag) {
      const d = await db(),
        tx = d.transaction("kv", "readwrite"),
        cur = await tx.store.get(key);
      if (etag && cur?.etag !== etag) throw new Error("SAVE_CONFLICT");
      const next = crypto.randomUUID();
      await tx.store.put({ value, etag: next }, key);
      await tx.done;
      return { etag: next };
    },
    async list(prefix) {
      return (await (await db()).getAllKeys("kv"))
        .filter((k) => String(k).startsWith(prefix))
        .map((k) => ({ key: String(k) }));
    },
    async remove(key) {
      await (await db()).delete("kv", key);
    },
    async upload(path, blob) {
      await (await db()).put("files", blob, path);
    },
    async blob(path) {
      const v = await (await db()).get("files", path);
      if (!v) throw new Error("文件不存在：" + path);
      return v;
    },
    async download(path, name) {
      saveBlob(await this.blob(path), name);
    },
    async listFiles(prefix) {
      return (await (await db()).getAllKeys("files"))
        .filter((k) => String(k).startsWith(prefix))
        .map(String);
    },
    async deleteFile(path) {
      await (await db()).delete("files", path);
    },
  };
}
function unwrap(r: any) {
  if (r?.ok === false) throw new Error(r.error?.code + ": " + r.error?.message);
  return r?.ok === true && r.result !== undefined ? r.result : r;
}
export async function connectPlatform(): Promise<Platform> {
  if (!new URLSearchParams(location.search).has("wid")) return localPlatform();
  const sdkPath = "/static/anna-apps/_sdk/latest/index.js";
  const { AnnaAppRuntime } = await import(/* @vite-ignore */ sdkPath);
  const anna = await AnnaAppRuntime.connect();
  return {
    kind: "anna",
    async complete(req: CompletionRequest) {
      const start = Date.now();
      const content: any[] = [{ type: "text", text: req.prompt }];
      for (const data of req.images || [])
        content.push({
          type: "image",
          data: data.split(",")[1],
          mimeType: "image/png",
        });
      const r = unwrap(
        await anna.llm.complete({
          systemPrompt: req.system,
          messages: [
            {
              role: "user",
              content: content.length === 1 ? content[0] : content,
            },
          ],
          maxTokens: req.maxTokens,
          thinking: false,
          temperature: 0.25,
          metadata: { purpose: req.purpose },
        }),
      );
      const usage: Usage = {
        purpose: req.purpose,
        model: r.model || "unknown",
        inputTokens: r.usage?.inputTokens || 0,
        outputTokens: r.usage?.outputTokens || 0,
        cu: r._meta?.quotaConsumed || 0,
        latencyMs: r._meta?.latencyMs || Date.now() - start,
        at: new Date().toISOString(),
      };
      if (r.stopReason === "maxTokens") {
        const e = new Error(
          "输出被截断，请缩短要求或重试当前阶段。",
        ) as Error & { usage: Usage };
        e.usage = usage;
        throw e;
      }
      return { text: r.content?.text || "", usage };
    },
    async get(key) {
      return unwrap(await anna.storage.get({ key }));
    },
    async set(key, value, etag) {
      try {
        return unwrap(
          await anna.storage.set({
            key,
            value,
            ...(etag ? { if_match: etag } : {}),
          }),
        );
      } catch (e) {
        if (String(e).includes("precondition"))
          throw new Error("SAVE_CONFLICT");
        throw e;
      }
    },
    async list(prefix) {
      let cursor: string | undefined;
      const out: any[] = [];
      do {
        const r = unwrap(
          await anna.storage.list({
            prefix,
            limit: 100,
            ...(cursor ? { cursor } : {}),
          }),
        );
        out.push(...r.items);
        cursor = r.next_cursor;
      } while (cursor);
      return out;
    },
    async remove(key, etag) {
      unwrap(
        await anna.storage.delete({ key, ...(etag ? { if_match: etag } : {}) }),
      );
    },
    async upload(path, blob) {
      const init = unwrap(
        await anna.files.upload_init({
          path,
          size: blob.size,
          content_type: blob.type || "application/octet-stream",
        }),
      );
      const r = await fetch(init.put_url, {
        method: "PUT",
        headers: {
          ...init.headers,
          "Content-Type": blob.type || "application/octet-stream",
        },
        body: blob,
      });
      if (!r.ok) throw new Error("文件上传失败 HTTP " + r.status);
      unwrap(
        await anna.files.upload_finalize({
          path,
          size: blob.size,
          ...(r.headers.get("etag") ? { etag: r.headers.get("etag") } : {}),
        }),
      );
    },
    async blob(path) {
      const r = unwrap(await anna.files.download_url({ path }));
      const response = await fetch(r.get_url);
      if (!response.ok) throw new Error("读取文件失败 HTTP " + response.status);
      return response.blob();
    },
    async download(path, filename) {
      unwrap(await anna.files.download({ path, filename }));
    },
    async listFiles(prefix) {
      let cursor: string | undefined;
      const paths: string[] = [];
      do {
        const r = unwrap(
          await anna.files.list({
            prefix,
            limit: 100,
            ...(cursor ? { cursor } : {}),
          }),
        );
        paths.push(...r.items.map((i: any) => i.path));
        cursor = r.next_cursor;
      } while (cursor);
      return paths;
    },
    async deleteFile(path) {
      unwrap(await anna.files.delete({ path }));
    },
  };
}
