import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = 3000;
const host = "127.0.0.1";
const stateDir = join(root, ".gallery-twin");
const configPath = join(stateDir, "local-config.json");
let webProcess;
let workerProcess;
let resolveStop;
let signalRequested = false;

if (typeof process.loadEnvFile === "function") {
  const envPath = join(root, ".env");
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}

function readStoredToken() {
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    return typeof parsed.WORKER_TOKEN === "string" && parsed.WORKER_TOKEN.length >= 32
      ? parsed.WORKER_TOKEN
      : undefined;
  } catch {
    return undefined;
  }
}

function getWorkerToken() {
  const configuredToken = process.env.WORKER_TOKEN;
  if (configuredToken) return configuredToken;

  const storedToken = readStoredToken();
  if (storedToken) return storedToken;

  const token = randomBytes(32).toString("hex");
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  writeFileSync(configPath, `${JSON.stringify({ WORKER_TOKEN: token }, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(configPath, 0o600);
  return token;
}

async function ensurePortFree() {
  await new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        reject(new Error(`Port ${port} is already in use on ${host}. Stop the existing process first.`));
      } else {
        reject(error);
      }
    });
    server.listen({ host, port }, () => server.close(resolvePromise));
  });
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function spawnChild(command, args, env) {
  return spawn(command, args, {
    cwd: root,
    env,
    detached: process.platform !== "win32",
    stdio: "inherit",
  });
}

async function waitForWeb(child) {
  const deadline = Date.now() + 60_000;
  const healthUrl = `http://${host}:${port}/`;

  while (Date.now() < deadline) {
    if (signalRequested) throw new Error("Local launcher stopped.");
    if (child.exitCode !== null) {
      throw new Error(`Web process exited before health check (code ${child.exitCode ?? "unknown"}).`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1_000);
    try {
      const response = await fetch(healthUrl, { signal: controller.signal });
      if (response.ok) return;
    } catch {
      // The development server is still starting.
    } finally {
      clearTimeout(timeout);
    }
    await sleep(250);
  }

  throw new Error(`Web health check timed out after 60 seconds (${healthUrl}).`);
}

function terminate(child) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolvePromise) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(forceKill);
      resolvePromise();
    };
    const forceKill = setTimeout(() => {
      if (child.exitCode === null) {
        if (process.platform === "win32" || !child.pid) child.kill("SIGKILL");
        else {
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {
            child.kill("SIGKILL");
          }
        }
      }
      finish();
    }, 5_000);
    child.once("exit", finish);
    if (process.platform === "win32" || !child.pid) child.kill("SIGTERM");
    else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    }
  });
}

process.once("SIGINT", () => {
  signalRequested = true;
  if (resolveStop) resolveStop(0);
  else void Promise.all([terminate(workerProcess), terminate(webProcess)]);
});
process.once("SIGTERM", () => {
  signalRequested = true;
  if (resolveStop) resolveStop(0);
  else void Promise.all([terminate(workerProcess), terminate(webProcess)]);
});

async function main() {
  await ensurePortFree();

  const workerToken = getWorkerToken();
  const env = {
    ...process.env,
    GALLERY_HOST: host,
    GALLERY_PORT: String(port),
    GALLERY_DB_DIR: join(stateDir, "pglite"),
    GALLERY_STORAGE_DIR: join(stateDir, "storage"),
    GALLERY_JOBS_DIR: join(stateDir, "jobs"),
    GALLERY_WORKER_URL: `http://${host}:${port}`,
    WORKER_TOKEN: workerToken,
    RECONSTRUCTION_PYTHON: process.env.RECONSTRUCTION_PYTHON
      ? resolve(root, process.env.RECONSTRUCTION_PYTHON)
      : join(root, "services", "reconstruction", ".venv", "bin", "python"),
  };

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const tsxCommand = join(root, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  webProcess = spawnChild(npmCommand, ["--workspace", "apps/web", "run", "dev", "--", "--hostname", host, "--port", String(port)], env);

  try {
    await waitForWeb(webProcess);
    if (signalRequested) throw new Error("Local launcher stopped.");
    workerProcess = spawnChild(tsxCommand, [join(root, "scripts", "worker.ts")], env);

    let stop;
    const stopped = new Promise((resolvePromise) => {
      stop = (code) => resolvePromise(code);
    });
    resolveStop = stop;
    const stopOnExit = (name, code) => {
      if (code === 0) stop(0);
      else stop(1);
      if (name === "web" && workerProcess && workerProcess.exitCode === null) void terminate(workerProcess);
      if (name === "worker" && webProcess.exitCode === null) void terminate(webProcess);
    };
    webProcess.once("exit", (code) => stopOnExit("web", code));
    workerProcess.once("exit", (code) => stopOnExit("worker", code));

    const exitCode = await stopped;
    await Promise.all([terminate(webProcess), terminate(workerProcess)]);
    process.exitCode = exitCode;
  } catch (error) {
    await Promise.all([terminate(workerProcess), terminate(webProcess)]);
    if (!signalRequested) throw error;
    process.exitCode = 0;
  }
}

main().catch((error) => {
  if (!signalRequested) console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
