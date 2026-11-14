// An account allowlist set as a secret: comma-separated GitHub numeric ids. One malformed value authorises nobody, so a
// typo in the secret fails closed rather than letting in an account it did not mean. STUDIO_HOST_IDS (studio-policy.js)
// and INSPECTOR_IDS (inspect-report.js) both read this way.
export const listedIds = (configured) => {
  if (typeof configured !== "string" || !configured.trim()) return [];
  const values = configured.split(",").map(value => value.trim());
  if (values.some(value => !/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)))) return [];
  return values.map(Number);
};

export const listed = (configured, id) => Number.isSafeInteger(id) && id > 0 && listedIds(configured).includes(id);
