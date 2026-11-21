// The publisher's only storage surface: bounded GET and conditional PUT to one configured R2 bucket.
// AWS SigV4 signs the body and precondition headers; credentials never enter URLs or error messages.
import { createHash, createHmac } from "node:crypto";

export const STORE_MAX_BYTES = 2 * 1024 * 1024;
const EMPTY = new Uint8Array();
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hmac = (key, value) => createHmac("sha256", key).update(value).digest();
const encode = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
const keyOK = (key) => /^(?:release\.json|catalogs\/[a-f0-9]{40}\/(?:active|[a-f0-9]{64})\.json|portraits\/[a-f0-9]{64}\/(?:manifest\.json|[a-f0-9]{64}\.png))$/.test(key);
const etagOK = (etag) => typeof etag === "string" && /^"[a-zA-Z0-9-]{1,128}"$/.test(etag);
const fail = (message) => { throw new Error(`Catalog storage: ${message}`); };

export const createCatalogStore = ({ accountId, bucket, accessKeyId, secretAccessKey, fetcher = fetch, now = Date.now, timeoutMs = 4000 }) => {
  if (!/^[a-f0-9]{32}$/.test(accountId || "") || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket || "")
    || typeof accessKeyId !== "string" || !/^[A-Za-z0-9]{16,128}$/.test(accessKeyId)
    || typeof secretAccessKey !== "string" || !/^[A-Za-z0-9/+_=.-]{16,256}$/.test(secretAccessKey)
    || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30000) fail("invalid configuration");
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const request = async (method, key, bytes = EMPTY, conditions = {}) => {
    if (typeof key !== "string" || !keyOK(key) || !(bytes instanceof Uint8Array) || bytes.byteLength > STORE_MAX_BYTES) fail("invalid object");
    const path = `/${bucket}/${key.split("/").map(encode).join("/")}`;
    const timestamp = new Date(now()).toISOString().replace(/[:-]|\.\d{3}/g, ""), day = timestamp.slice(0, 8), payload = hash(bytes);
    const headers = { host, "x-amz-content-sha256": payload, "x-amz-date": timestamp };
    if (method === "PUT") {
      if (conditions.ifNoneMatch === "*" && conditions.ifMatch === undefined) headers["if-none-match"] = "*";
      else if (etagOK(conditions.ifMatch) && conditions.ifNoneMatch === undefined) headers["if-match"] = conditions.ifMatch;
      else fail("every write requires exactly one strong precondition");
      if (!["application/json", "image/png"].includes(conditions.contentType)) fail("unsupported content type");
      headers["content-type"] = conditions.contentType;
    }
    const names = Object.keys(headers).sort(), signed = names.join(";");
    const canonical = [method, path, "", names.map((name) => `${name}:${headers[name]}\n`).join(""), signed, payload].join("\n");
    const scope = `${day}/auto/s3/aws4_request`;
    const signing = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), "auto"), "s3"), "aws4_request");
    const signature = createHmac("sha256", signing).update(`AWS4-HMAC-SHA256\n${timestamp}\n${scope}\n${hash(canonical)}`).digest("hex");
    headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;
    // Compression can weaken the object ETag. Keep transport negotiation outside SigV4,
    // and read the original bytes so their strong ETag remains usable for conditional writes.
    if (method === "GET") headers["accept-encoding"] = "identity";
    const controller = new AbortController();
    let timer, reader = null;
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => {
      controller.abort(); if (reader) reader.cancel().catch(() => {});
      reject(new Error("Catalog storage: request timed out; write outcome may be unknown"));
    }, timeoutMs); });
    const work = (async () => {
      let response;
      try { response = await fetcher(`https://${host}${path}`, { method, headers,
        ...(method === "PUT" ? { body: bytes } : {}), redirect: "error", signal: controller.signal }); }
      catch { fail("request unavailable; write outcome may be unknown"); }
      if (controller.signal.aborted) { response.body?.cancel().catch(() => {}); fail("request expired"); }
      if (response.status === 404 && method === "GET" || response.status === 412 && method === "PUT") {
        response.body?.cancel().catch(() => {}); return null;
      }
      if (!response.ok) { response.body?.cancel().catch(() => {}); fail(`request returned ${response.status}`); }
      const etag = response.headers.get("etag");
      if (!etagOK(etag)) { response.body?.cancel().catch(() => {}); fail("missing strong object ETag"); }
      if (method === "PUT") { response.body?.cancel().catch(() => {}); return { etag }; }
      const declared = response.headers.get("content-length");
      if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > STORE_MAX_BYTES)) { response.body?.cancel().catch(() => {}); fail("object exceeds byte bound"); }
      if (!response.body) return { etag, bytes: EMPTY };
      reader = response.body.getReader();
      const chunks = []; let length = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (controller.signal.aborted) fail("request expired");
          if (chunk.done) break;
          if (!(chunk.value instanceof Uint8Array)) fail("invalid response body");
          length += chunk.value.byteLength;
          if (length > STORE_MAX_BYTES || declared !== null && length > Number(declared)) fail("object exceeds byte bound");
          chunks.push(chunk.value);
        }
        if (declared !== null && length !== Number(declared)) fail("object length mismatch");
        const data = new Uint8Array(length); let offset = 0;
        for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
        return { etag, bytes: data };
      } catch (error) { reader.cancel().catch(() => {}); throw error; }
      finally { reader.releaseLock(); reader = null; }
    })();
    try { return await Promise.race([work, deadline]); } finally { clearTimeout(timer); }
  };
  return { get: (key) => request("GET", key), put: (key, bytes, conditions) => request("PUT", key, bytes, conditions) };
};

export const catalogStoreFromEnv = (env = process.env) => createCatalogStore({
  accountId: env.CHARACTER_CATALOG_R2_ACCOUNT_ID, bucket: env.CHARACTER_CATALOG_R2_BUCKET,
  accessKeyId: env.CHARACTER_CATALOG_R2_ACCESS_KEY_ID, secretAccessKey: env.CHARACTER_CATALOG_R2_SECRET_ACCESS_KEY
});
