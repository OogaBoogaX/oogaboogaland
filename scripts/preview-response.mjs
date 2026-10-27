// Local preview responses only. Single-byte ranges let media clients fetch metadata
// and seek without depending on a complete download; multipart ranges are ignored.
export function previewResponse(body, type, { method = "GET", headers = {} } = {}, media = false) {
  let status = 200, output = body;
  const responseHeaders = { "Content-Type": type, "Cache-Control": "no-store" };
  if (media) responseHeaders["Accept-Ranges"] = "bytes";
  const match = media && method === "GET" && !headers["if-range"] && /^bytes=(\d*)-(\d*)$/.exec(headers.range || "");
  if (match && (match[1] || match[2])) {
    const size = body.length, first = match[1] ? Number(match[1]) : null, last = match[2] ? Number(match[2]) : null;
    if ((first === null || Number.isSafeInteger(first)) && (last === null || Number.isSafeInteger(last)) && (first === null || last === null || last >= first)) {
      const start = first === null ? Math.max(0, size - last) : first;
      const end = first === null || last === null ? size - 1 : Math.min(last, size - 1);
      if (size === 0 || start >= size || end < start || first === null && last === 0) {
        status = 416; output = Buffer.alloc(0); responseHeaders["Content-Range"] = `bytes */${size}`;
      } else {
        status = 206; output = body.subarray(start, end + 1); responseHeaders["Content-Range"] = `bytes ${start}-${end}/${size}`;
      }
    }
  }
  responseHeaders["Content-Length"] = output.length;
  return { status, headers: responseHeaders, body: method === "HEAD" ? undefined : output };
}
