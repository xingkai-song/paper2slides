export async function deadline<T>(
  work: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(label + "超时")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
export async function uploadWithRetry(
  api: {
    init: (
      path: string,
      blob: Blob,
    ) => Promise<{ put_url: string; headers?: Record<string, string> }>;
    finalize: (
      path: string,
      blob: Blob,
      etag: string | null,
    ) => Promise<unknown>;
  },
  path: string,
  blob: Blob,
  onProgress?: (text: string) => void,
) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      onProgress?.(`申请上传地址（${attempt}/2）`);
      const init = await deadline(api.init(path, blob), 15000, "申请上传地址");
      onProgress?.(`传输文件（${attempt}/2）`);
      const response = await fetch(init.put_url, {
        method: "PUT",
        headers: {
          ...init.headers,
          "Content-Type": blob.type || "application/octet-stream",
        },
        body: blob,
        signal: AbortSignal.timeout(35000),
      });
      if (!response.ok) throw new Error("文件上传失败 HTTP " + response.status);
      onProgress?.("确认文件已保存");
      await deadline(
        api.finalize(path, blob, response.headers.get("etag")),
        15000,
        "确认上传",
      );
      return;
    } catch (error) {
      const text = String(error);
      if (
        attempt === 2 ||
        !/timeout|超时|network|fetch|HTTP (408|429|5\d\d)/i.test(text)
      )
        throw error;
      onProgress?.("网络异常，正在重试文件上传（不重新生成内容）");
    }
  }
}
