/**
 * One browser tab on http://localhost:3000 for every worktree.
 *
 *   bun scripts/preview.ts        preview this worktree (T3's Preview button)
 *   bun scripts/preview.ts stop   stop this worktree's dev server
 *   bun scripts/preview.ts hub    run the hub (started for you)
 *
 * The hub owns port 3000 and proxies it, websockets included, to the dev server
 * of the worktree previewed last. Each worktree keeps its own `next dev` on a
 * port of its own, so switching back is instant, until Ctrl-C in its Preview
 * terminal stops it. Open tabs reload when the hub switches, keep their path,
 * and show the thread's name in their title. The hub stops dev servers whose
 * worktree has been removed.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { ServerWebSocket } from "bun";
import { Database } from "bun:sqlite";

const hubPort = Number(process.env.PREVIEW_HUB_PORT) || 3000;
const hubUrl = `http://127.0.0.1:${hubPort}`;
const version = createHash("sha1").update(readFileSync(import.meta.path)).digest("hex");
const stateDir = join(homedir(), ".cache", "planfri-preview", String(hubPort));

type Site = { dir: string; name: string; port: number; pgid?: number };

const mode = process.argv[2] ?? "preview";
if (mode === "hub") hub();
else if (mode === "stop") await stop();
else if (mode === "preview") await preview();
else {
  console.error(`Unknown mode "${mode}". Use preview, stop or hub.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Preview: make sure the hub and this worktree's dev server run, then switch.

async function preview() {
  const dir = worktree();
  const name = displayName(dir);
  await ensureHub();

  let server = runningDevServer(dir);
  const log = join(dir, ".next", "preview.log");
  if (!server) {
    const port = freePort(4100 + (createHash("sha1").update(dir).digest().readUInt16BE(0) % 900));
    mkdirSync(join(dir, ".next"), { recursive: true });
    const out = openSync(log, "w");
    const env = { ...process.env };
    delete env.PORT;
    const child = spawn(join(dir, "node_modules", ".bin", "next"), ["dev", "--port", String(port), "--hostname", "127.0.0.1"], {
      cwd: dir,
      env,
      detached: true,
      stdio: ["ignore", out, out],
    });
    child.unref();
    server = { port, pgid: child.pid! };
    console.log(`Starting ${name} on port ${port}.`);
  } else {
    console.log(`${name} is already running on port ${server.port}.`);
  }

  await post("/__preview/switch", { dir, name, port: server.port, pgid: server.pgid } satisfies Site);
  console.log(`Previewing ${name} at http://localhost:${hubPort}`);
  console.log(`Ctrl-C stops the dev server.\n`);

  // Follow the server's log so the Preview terminal stays useful. The server
  // runs in its own process group, so Ctrl-C reaches it only through here.
  const tail = spawn("tail", ["-n", "40", "-F", `--pid=${process.pid}`, log], { stdio: "inherit" });
  const { pgid } = server;
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    killGroup(pgid);
    tail.kill();
    await post("/__preview/forget", { dir }).catch(() => {});
    console.log(`\nStopped ${name}.`);
    process.exit(0);
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, shutdown);
  // A server that exits on its own ends the Preview too.
  setInterval(() => {
    if (!alive(pgid)) shutdown();
  }, 1000);
  await new Promise((resolve) => tail.on("exit", resolve));
}

async function stop() {
  const dir = worktree();
  const server = runningDevServer(dir);
  if (!server) return console.log("No dev server is running for this worktree.");
  killGroup(server.pgid);
  await post("/__preview/forget", { dir }).catch(() => {});
  console.log(`Stopped the dev server on port ${server.port}.`);
}

function worktree() {
  return spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).stdout.trim() || process.cwd();
}

/** The T3 thread's title, else the branch without its `t3/` prefix. */
function displayName(dir: string) {
  const thread = process.env.T3CODE_THREAD_ID;
  const home = process.env.T3CODE_HOME || join(homedir(), ".t3");
  if (thread) {
    try {
      const db = new Database(join(home, "userdata", "statev2.sqlite"), { readonly: true });
      const row = db.query("select title from orchestration_v2_projection_threads where thread_id = ?").get(thread) as { title?: string } | null;
      db.close();
      if (row?.title) return row.title;
    } catch {
      // T3's schema is its own business; fall back to the branch.
    }
  }
  const branch = spawnSync("git", ["branch", "--show-current"], { cwd: dir, encoding: "utf8" }).stdout.trim();
  return branch.replace(/^t3\//, "") || basename(dir);
}

/** Next writes `.next/dev/lock` with the server's pid and port. */
function runningDevServer(dir: string) {
  try {
    const lock = JSON.parse(readFileSync(join(dir, ".next", "dev", "lock"), "utf8")) as { pid: number; port: number };
    if (lock.port === hubPort || !alive(lock.pid)) return null;
    const pgid = Number(spawnSync("ps", ["-o", "pgid=", "-p", String(lock.pid)], { encoding: "utf8" }).stdout.trim());
    return { port: lock.port, pgid: pgid || lock.pid };
  } catch {
    return null;
  }
}

async function ensureHub() {
  const health = await fetch(`${hubUrl}/__preview/health`, { signal: AbortSignal.timeout(1000) })
    .then((r) => (r.ok ? (r.json() as Promise<{ version: string }>) : null))
    .catch(() => null);
  if (health?.version === version) return;
  if (health) {
    console.log("Restarting the preview hub with the new script.");
    await post("/__preview/quit", {}).catch(() => {});
  }
  killListener(hubPort, () => true); // anything else on 3000, e.g. the old Preview's server
  await waitFor(() => !listening(hubPort), 10_000);

  mkdirSync(stateDir, { recursive: true });
  const out = openSync(join(stateDir, "hub.log"), "a");
  spawn(process.execPath, [import.meta.path, "hub"], { cwd: homedir(), detached: true, stdio: ["ignore", out, out] }).unref();
  if (!(await waitFor(() => listening(hubPort), 10_000))) {
    console.error(`The preview hub didn't start. See ${join(stateDir, "hub.log")}.`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Hub

type Socket = ServerWebSocket<{ target: string; headers: Record<string, string>; protocols: string[]; upstream?: WebSocket; queue: (string | Buffer)[] }>;

function hub() {
  const sites = new Map<string, Site>();
  let active: Site | null = null;
  let ready = false;
  const listeners = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const encoder = new TextEncoder();

  const state = () => ({ dir: active?.dir ?? null, name: active?.name ?? null, ready });
  const broadcast = () => {
    const message = encoder.encode(`data: ${JSON.stringify(state())}\n\n`);
    for (const listener of listeners) {
      try {
        listener.enqueue(message);
      } catch {
        listeners.delete(listener);
      }
    }
  };

  // Watch the active server until it answers, then tell waiting tabs.
  let checking = false;
  setInterval(async () => {
    if (!active || ready || checking) return;
    const site = active;
    checking = true;
    // A static path, so the check never renders a page.
    const up = await fetch(`http://127.0.0.1:${site.port}/_next/static/__preview-ping`, { signal: AbortSignal.timeout(5000) })
      .then(() => true)
      .catch(() => false);
    checking = false;
    if (up && active === site && !ready) {
      ready = true;
      broadcast();
    }
  }, 300);

  // Stop the servers of removed worktrees.
  setInterval(() => {
    for (const site of sites.values()) {
      if (existsSync(site.dir)) continue;
      if (site.pgid) killGroup(site.pgid);
      sites.delete(site.dir);
      console.log(`Stopped ${site.name}: its worktree is gone.`);
      if (active?.dir === site.dir) {
        active = null;
        broadcast();
      }
    }
  }, 30_000);

  // Keep EventSource connections open through idle proxies.
  setInterval(() => {
    for (const listener of listeners) {
      try {
        listener.enqueue(encoder.encode(": ping\n\n"));
      } catch {
        listeners.delete(listener);
      }
    }
  }, 20_000);

  Bun.serve<Socket["data"]>({
    port: hubPort,
    idleTimeout: 0,
    async fetch(request, server) {
      const url = new URL(request.url);

      if (url.pathname === "/__preview/health") return Response.json({ version, ...state() });
      if (url.pathname === "/__preview/events") {
        let self: ReadableStreamDefaultController<Uint8Array>;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            self = controller;
            listeners.add(controller);
            controller.enqueue(encoder.encode(`retry: 1000\ndata: ${JSON.stringify(state())}\n\n`));
          },
          cancel() {
            listeners.delete(self);
          },
        });
        return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store" } });
      }
      if (request.method === "POST" && url.pathname === "/__preview/switch") {
        const site = (await request.json()) as Site;
        sites.set(site.dir, site);
        active = site;
        ready = false;
        broadcast();
        console.log(`Previewing ${site.name} (${site.dir}) on port ${site.port}.`);
        return Response.json(state());
      }
      if (request.method === "POST" && url.pathname === "/__preview/forget") {
        const { dir } = (await request.json()) as { dir: string };
        sites.delete(dir);
        if (active?.dir === dir) {
          active = null;
          broadcast();
        }
        return Response.json(state());
      }
      if (request.method === "POST" && url.pathname === "/__preview/quit") {
        setTimeout(() => process.exit(0), 50);
        return new Response("Bye");
      }

      if (!active) return page(null, "Nothing to preview yet. Click Preview in a thread.");
      const site = active;
      const target = `127.0.0.1:${site.port}${url.pathname}${url.search}`;

      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        const headers: Record<string, string> = {};
        for (const key of ["cookie", "origin", "user-agent"]) {
          const value = request.headers.get(key);
          if (value) headers[key] = value;
        }
        const protocols = (request.headers.get("sec-websocket-protocol") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
        if (server.upgrade(request, { data: { target: `ws://${target}`, headers, protocols, queue: [] } })) return;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }

      const headers = new Headers(request.headers);
      headers.set("accept-encoding", "identity");
      let response: Response;
      try {
        response = await fetch(`http://${target}`, {
          method: request.method,
          headers,
          body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
          redirect: "manual",
          decompress: false,
        });
      } catch {
        return page(site, ready ? "The dev server isn't answering." : "Starting the dev server…");
      }

      const responseHeaders = new Headers(response.headers);
      if (!responseHeaders.get("content-type")?.startsWith("text/html") || !response.body) {
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
      }
      responseHeaders.delete("content-length");
      return new Response(injectClient(response.body, client(site, false)), {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    },
    websocket: {
      open(ws: Socket) {
        const upstream = new BunWebSocket(ws.data.target, { headers: ws.data.headers, protocols: ws.data.protocols });
        upstream.binaryType = "arraybuffer";
        ws.data.upstream = upstream;
        upstream.onopen = () => {
          for (const message of ws.data.queue) upstream.send(message);
          ws.data.queue = [];
        };
        upstream.onmessage = (event) => ws.send(typeof event.data === "string" ? event.data : new Uint8Array(event.data as ArrayBuffer));
        upstream.onclose = () => ws.close();
        upstream.onerror = () => ws.close();
      },
      message(ws: Socket, message) {
        const upstream = ws.data.upstream;
        if (upstream?.readyState === WebSocket.OPEN) upstream.send(message);
        else ws.data.queue.push(message);
      },
      close(ws: Socket) {
        ws.data.upstream?.close();
      },
    },
  });
  console.log(`Preview hub listening on http://localhost:${hubPort}`);
}

// lib.dom's WebSocket type hides Bun's options, which carry the cookies upstream.
const BunWebSocket = WebSocket as unknown as new (url: string, options: Bun.WebSocketOptions) => WebSocket;

/** Inserts the client script at the end of `<head>`, after the app's own tags, so hydration still matches. */
function injectClient(body: ReadableStream<Uint8Array>, script: string) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = "";
  let done = false;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (done) return controller.enqueue(chunk);
        pending += decoder.decode(chunk, { stream: true });
        const head = pending.search(/<\/head>/i);
        if (head >= 0 || pending.length > 256_000) {
          const at = Math.max(head, 0);
          controller.enqueue(encoder.encode(pending.slice(0, at) + script + pending.slice(at)));
          pending = "";
          done = true;
        }
      },
      flush(controller) {
        if (!done) controller.enqueue(encoder.encode(script + pending + decoder.decode()));
      },
    }),
  );
}

/** Keeps the tab's title prefixed and reloads it when the hub switches. */
function client(site: Site | null, waiting: boolean) {
  const config = JSON.stringify({ dir: site?.dir ?? null, name: site?.name ?? null, waiting });
  return `<script>(() => {
  const config = ${config.replace(/</g, "\\u003c")};
  if (config.name) {
    const prefix = "[" + config.name + "] ";
    const fix = () => {
      if (!document.title.startsWith(prefix)) document.title = prefix + document.title.replace(/^\\[[^\\]]*\\] /, "");
    };
    // After hydration, so React's <title> still matches what the server sent.
    addEventListener("load", () => {
      setTimeout(() => {
        fix();
        new MutationObserver(fix).observe(document.head, { subtree: true, childList: true, characterData: true });
      }, 500);
    });
  }
  const events = new EventSource("/__preview/events");
  events.onmessage = (event) => {
    const state = JSON.parse(event.data);
    if (state.dir !== config.dir || (config.waiting && state.ready)) location.reload();
  };
})();</script>`;
}

function page(site: Site | null, message: string) {
  const escape = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const title = site ? `[${site.name}] ${message}` : "Preview";
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title>${client(site, true)}
<style>body{font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;color:#444;background:#fafafa}
@media (prefers-color-scheme:dark){body{color:#ccc;background:#171717}}p{margin:.25rem;text-align:center}</style></head>
<body><main>${site ? `<p><strong>${escape(site.name)}</strong></p>` : ""}<p>${escape(message)}</p></main></body></html>`,
    { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

// ---------------------------------------------------------------------------
// Processes and ports

function post(path: string, body: unknown) {
  return fetch(`${hubUrl}${path}`, { method: "POST", body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
}

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killGroup(pgid: number) {
  try {
    process.kill(-pgid, "SIGTERM");
  } catch {
    try {
      process.kill(pgid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
}

function listenerPids(port: number) {
  const out = spawnSync("ss", ["-ltnpH", `sport = :${port}`], { encoding: "utf8" }).stdout;
  return [...new Set([...out.matchAll(/pid=(\d+)/g)].map((m) => Number(m[1])))];
}

function listening(port: number) {
  return spawnSync("ss", ["-ltnH", `sport = :${port}`], { encoding: "utf8" }).stdout.trim() !== "";
}

/** Kills what listens on `port`, and the `next dev` that spawned it. */
function killListener(port: number, which: (pid: number) => boolean) {
  for (const pid of listenerPids(port).filter(which)) {
    const parent = Number(spawnSync("ps", ["-o", "ppid=", "-p", String(pid)], { encoding: "utf8" }).stdout.trim());
    const parentArgs = parent ? spawnSync("ps", ["-o", "args=", "-p", String(parent)], { encoding: "utf8" }).stdout : "";
    try {
      process.kill(parentArgs.includes("next dev") ? parent : pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
}

function freePort(start: number) {
  for (let port = start; port < start + 200; port++) {
    if (port !== hubPort && !listening(port)) return port;
  }
  throw new Error(`No free port from ${start}.`);
}

async function waitFor(check: () => boolean, ms: number) {
  for (const end = Date.now() + ms; Date.now() < end; await Bun.sleep(150)) {
    if (check()) return true;
  }
  return check();
}
