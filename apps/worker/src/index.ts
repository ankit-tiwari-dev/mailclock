import { hostname } from "node:os";
import { closeTransports, dispatchDue } from "@mailclock/core";
import { prisma } from "@mailclock/db";

const POLL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 2000);
const BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE ?? 25);
const LEASE_SECONDS = Number(process.env.WORKER_LEASE_SECONDS ?? 120);
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 5);
const workerId = `worker-${hostname()}-${process.pid}`;

let stopping = false;
let wake: (() => void) | null = null;

const log = (msg: string, extra?: Record<string, unknown>) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), worker: workerId, msg, ...extra }));

async function loop() {
  log("started", { pollMs: POLL_MS, batchSize: BATCH_SIZE, leaseSeconds: LEASE_SECONDS, concurrency: CONCURRENCY });
  while (!stopping) {
    try {
      const r = await dispatchDue({ workerId, batchSize: BATCH_SIZE, leaseSeconds: LEASE_SECONDS, concurrency: CONCURRENCY });
      if (r.claimed) log("tick", r);
    } catch (err) {
      log("tick failed", { error: err instanceof Error ? err.message : String(err) });
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, POLL_MS);
      wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }
}

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log("stopping", { signal });
  wake?.();
  // In-flight sends finish inside the current tick; any lease left behind is reclaimed by the next worker.
  setTimeout(() => process.exit(1), 30_000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await loop();
closeTransports();
await prisma.$disconnect();
log("stopped");
