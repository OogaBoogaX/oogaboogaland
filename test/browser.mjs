// Minimal headless-Chrome driver over the DevTools protocol
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const COMMAND_MS = 90000;

export const launch = async ({ w = 1440, h = 900, mobile = false } = {}) => {
  // Fresh profile per launch, so storage never leaks
  const profile = mkdtempSync(join(tmpdir(), "ooga-test-"));
  // Chrome picks a free port and writes it into the profile, so concurrent launches never collide
  const args = [
    "--headless=new",
    "--hide-scrollbars",
    "--mute-audio",
    `--window-size=${w},${h}`,
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--enable-precise-memory-info",
    "about:blank"
  ];
  const chrome = spawn(CHROME, args, { stdio: "ignore" });
  const logs = [];
  let targets = null;
  for (let i = 0; i < 100 && !targets; i++) {
    await sleep(100);
    try {
      const port = parseInt(readFileSync(join(profile, "DevToolsActivePort"), "utf8"), 10);
      if (port) targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    } catch {
      targets = null;
    }
  }
  if (!targets) {
    chrome.kill();
    rmSync(profile, { recursive: true, force: true });
    throw new Error(`Chrome did not start at ${CHROME}`);
  }
  const page = targets.find((t) => t.type === "page");
  // Chrome can refuse or drop the first socket while it is still starting up: retry, and never wait on a socket that failed
  const connect = () => new Promise((resolve, reject) => {
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    socket.onopen = () => resolve(socket);
    socket.onerror = () => reject(new Error("DevTools socket failed"));
    socket.onclose = () => reject(new Error("DevTools socket closed before opening"));
  });
  let ws = null;
  for (let attempt = 0; !ws; attempt++) {
    try {
      ws = await connect();
    } catch (err) {
      if (attempt === 4) {
        chrome.kill();
        rmSync(profile, { recursive: true, force: true });
        throw err;
      }
      await sleep(250);
    }
  }
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
      return;
    }
    listeners.get(m.method)?.(m.params);
    if (m.method === "Runtime.consoleAPICalled") logs.push(`[console.${m.params.type}] ${m.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
    if (m.method === "Runtime.exceptionThrown") logs.push(`[exception] ${m.params.exceptionDetails.text} ${m.params.exceptionDetails.exception?.description ?? ""}`);
    if (m.method === "Log.entryAdded") logs.push(`[log.${m.params.entry.level}] ${m.params.entry.text}`);
  };
  // A reply that never comes (Chrome's DevTools channel can die silently) fails the case instead of freezing the run
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    const timer = setTimeout(() => {
      pending.delete(i);
      reject(new Error(`${method} got no reply in ${COMMAND_MS / 1000} s: Chrome hung`));
    }, COMMAND_MS);
    pending.set(i, (m) => {
      clearTimeout(timer);
      resolve(m);
    });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  // Raw protocol events, null to stop listening
  const on = (method, fn) => listeners.set(method, fn);
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");
  if (mobile) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  }
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, ...extra });
  const drag = async (from, to, steps = 12) => {
    await mouse("mouseMoved", from.x, from.y, { button: "none" });
    await mouse("mousePressed", from.x, from.y, { buttons: 1 });
    for (let i = 1; i <= steps; i++) {
      await mouse("mouseMoved", from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps, { buttons: 1 });
      await sleep(30);
    }
    await mouse("mouseReleased", to.x, to.y);
  };
  const click = async (x, y) => {
    await mouse("mouseMoved", x, y, { button: "none" });
    await mouse("mousePressed", x, y, { buttons: 1 });
    await sleep(40);
    await mouse("mouseReleased", x, y);
  };
  const key = async (k, modifiers = 0) => {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, text: k.length === 1 ? k : undefined, modifiers });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, modifiers });
  };
  const focus = (enabled) => send("Emulation.setFocusEmulationEnabled", { enabled });
  const screenshot = async (path) => {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path, Buffer.from(shot.result.data, "base64"));
  };
  const open = async (url) => {
    await send("Page.navigate", { url });
  };
  const close = () => {
    ws.close();
    chrome.kill();
    const removeProfile = (attempt = 0) => {
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch (err) {
        if (err.code !== "ENOTEMPTY" || attempt === 4) return;
        setTimeout(() => removeProfile(attempt + 1), 250 * (attempt + 1)).unref();
      }
    };
    setTimeout(removeProfile, 500).unref();
  };
  return { send, on, evaluate, mouse, drag, click, key, focus, screenshot, open, close, sleep, logs };
};
