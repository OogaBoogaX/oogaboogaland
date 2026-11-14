// What every deploy of the island's Worker relies on in its wrangler configs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJsonc } from "./cloudflare-host.mjs";

test("staging and production move every Durable Object onto new code the moment a deploy lands", () => {
  for (const env of ["staging", "production"]) {
    const config = readJsonc(new URL(`../../wrangler.${env}.jsonc`, import.meta.url));
    // Omitted, Cloudflare defers it up to 5 minutes, and a fix to the room waits for the room to hibernate.
    assert.deepEqual(config.durable_objects.code_update_strategy, { mode: "immediate" }, env);
  }
});
