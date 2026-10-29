"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Info = {
  pod: string;
  node: string;
  namespace: string;
  podIp: string;
  inKubernetes: boolean;
  version: string;
  gitSha: string;
  buildTime: string;
  environment: string;
  message: string;
  ready: boolean;
  chaosEnabled: boolean;
  uptimeSeconds: number;
  nodeVersion: string;
  serverTime: string;
};

type LogLine = { time: string; text: string; kind: "info" | "warn" | "good" | "bad" };

const POLL_MS = 1500;
// If a pod we have seen stops answering for this long, we say it left the rotation
const GONE_AFTER_MS = 9000;

const PIPELINE = [
  { name: "Push to GitHub", tool: "git" },
  { name: "Build and type-check", tool: "GitHub Actions" },
  { name: "Docker image build", tool: "multi-stage Dockerfile" },
  { name: "Vulnerability scan", tool: "Trivy" },
  { name: "Push image", tool: "GitHub Container Registry" },
  { name: "Update manifest in Git", tool: "kustomize image tag" },
  { name: "GitOps sync", tool: "Argo CD" },
  { name: "Rolling update", tool: "Kubernetes" },
];

const now = () => new Date().toLocaleTimeString();

export default function Dashboard() {
  const [info, setInfo] = useState<Info | null>(null);
  const [down, setDown] = useState(false);
  const [tally, setTally] = useState<Record<string, number>>({});
  const [log, setLog] = useState<LogLine[]>([]);
  const [busy, setBusy] = useState(false);

  // Mutable tracking that must not trigger re-renders
  const lastUptime = useRef<Record<string, number>>({});
  const lastSeen = useRef<Record<string, number>>({});
  const gone = useRef<Set<string>>(new Set());
  const failedAt = useRef<number | null>(null);

  const addLog = useCallback((text: string, kind: LogLine["kind"] = "info") => {
    setLog((prev) => [{ time: now(), text, kind }, ...prev].slice(0, 60));
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/info", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data: Info = await res.json();
      const t = Date.now();

      if (failedAt.current !== null) {
        const secs = ((t - failedAt.current) / 1000).toFixed(1);
        addLog(`Service reachable again after ${secs}s (answered by ${data.pod})`, "good");
        failedAt.current = null;
      }
      setDown(false);

      const prevUptime = lastUptime.current[data.pod];
      if (prevUptime === undefined && Object.keys(lastUptime.current).length > 0) {
        addLog(`Pod ${data.pod} is serving traffic`, "info");
      }
      if (prevUptime !== undefined && data.uptimeSeconds + 1 < prevUptime) {
        addLog(
          `Pod ${data.pod} was restarted by Kubernetes (uptime reset to ${data.uptimeSeconds}s). Self-healing worked.`,
          "good"
        );
      }
      if (gone.current.has(data.pod)) {
        gone.current.delete(data.pod);
        addLog(`Pod ${data.pod} is back in the Service rotation`, "good");
      }

      lastUptime.current[data.pod] = data.uptimeSeconds;
      lastSeen.current[data.pod] = t;
      setInfo(data);
      setTally((prev) => ({ ...prev, [data.pod]: (prev[data.pod] ?? 0) + 1 }));
    } catch {
      if (failedAt.current === null) {
        failedAt.current = Date.now();
        addLog("No response from the Service (request failed)", "bad");
      }
      setDown(true);
    }

    // Did a pod we know about stop receiving traffic?
    const t = Date.now();
    for (const [pod, seen] of Object.entries(lastSeen.current)) {
      if (t - seen > GONE_AFTER_MS && !gone.current.has(pod)) {
        gone.current.add(pod);
        addLog(
          `Pod ${pod} stopped receiving traffic (removed from Service endpoints or restarting)`,
          "warn"
        );
      }
    }
  }, [addLog]);

  useEffect(() => {
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  async function act(path: string, label: string) {
    setBusy(true);
    try {
      const res = await fetch(path, { method: "POST", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        addLog(`${label}: blocked. ENABLE_CHAOS is not true on this pod.`, "warn");
      } else if (path.includes("crash")) {
        addLog(`Crash signal sent to pod ${data.pod}. Watch Kubernetes restart it.`, "warn");
      } else {
        addLog(
          `Pod ${data.pod} readiness is now ${data.ready ? "READY" : "NOT READY"}. ` +
            (data.ready ? "" : "The Service should stop sending it traffic within a few seconds."),
          data.ready ? "good" : "warn"
        );
      }
    } catch {
      addLog(`${label}: request failed`, "bad");
    } finally {
      setBusy(false);
    }
  }

  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  const pods = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const shortSha = info?.gitSha ? info.gitSha.slice(0, 7) : "-";

  return (
    <div className="wrap">
      <div className="header">
        <h1>DevOps Control Room</h1>
        <span className="badge">
          <span className={`dot ${down ? "bad" : info?.ready === false ? "warn" : "ok"}`} />
          {down ? "Service unreachable" : info?.ready === false ? "This pod: not ready" : "Service healthy"}
        </span>
      </div>
      <p className="sub">
        A live view of this app running on Kubernetes: which pod answers you, how traffic is
        spread, what happens when a pod dies, and which commit the pipeline deployed.
      </p>

      {info && !info.inKubernetes && (
        <div className="card" style={{ marginBottom: 18, borderColor: "#6b5a1f" }}>
          Running <b>outside Kubernetes</b> (local dev), so pod, node and namespace show defaults.
          Deploy it to minikube to see the real values.
        </div>
      )}

      {/* ---- Live stats ---- */}
      <div className="grid stats">
        <div className="card stat">
          <div className="label">Answering pod</div>
          <div className="value mono">{info?.pod ?? "..."}</div>
          <div className="note">changes as the Service load-balances</div>
        </div>
        <div className="card stat">
          <div className="label">Version / commit</div>
          <div className="value mono">
            {info?.version ?? "..."} &middot; {shortSha}
          </div>
          <div className="note">built {info?.buildTime ?? "..."}</div>
        </div>
        <div className="card stat">
          <div className="label">Pod uptime</div>
          <div className="value">{info ? `${info.uptimeSeconds}s` : "..."}</div>
          <div className="note">resets when the container restarts</div>
        </div>
        <div className="card stat">
          <div className="label">Environment (ConfigMap)</div>
          <div className="value">{info?.environment ?? "..."}</div>
          <div className="note">{info?.message ?? ""}</div>
        </div>
      </div>

      <div className="grid two">
        {/* ---- Load balancing ---- */}
        <div className="card">
          <h2>Load balancing across pods</h2>
          <p className="hint">
            Every {POLL_MS / 1000}s this page calls the Service. Each bar shows how many answers
            came from each pod. With 3 replicas, the bars fill up evenly.
          </p>
          {pods.length === 0 && <div className="empty">Waiting for the first response...</div>}
          {pods.map(([pod, n]) => (
            <div className="bar-row" key={pod}>
              <div className="bar-top">
                <span className="mono">{pod}</span>
                <span>
                  {n} ({total ? Math.round((n / total) * 100) : 0}%)
                </span>
              </div>
              <div className="bar">
                <span style={{ width: `${total ? (n / total) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
          <div style={{ marginTop: 12 }}>
            <button
              className="btn"
              onClick={() => {
                setTally({});
              }}
            >
              Reset counts
            </button>
          </div>
        </div>

        {/* ---- Chaos / self-healing ---- */}
        <div className="card">
          <h2>Break things on purpose</h2>
          <p className="hint">
            Each button hits a random replica. Then watch the event log and the bars.
          </p>
          <div className="btns">
            <button
              className="btn danger"
              disabled={busy}
              onClick={() => act("/api/crash", "Crash")}
            >
              Crash a pod
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={() => act("/api/ready", "Readiness toggle")}
            >
              Toggle readiness of a pod
            </button>
          </div>
          <table>
            <tbody>
              <tr>
                <td>Crash a pod</td>
                <td>
                  The container exits. Kubernetes restarts it. The other pods keep serving, so users
                  see no downtime.
                </td>
              </tr>
              <tr>
                <td>Toggle readiness</td>
                <td>
                  The pod stays alive but fails its readiness probe, so the Service stops sending it
                  traffic. Click again (it may hit another pod) until it is ready.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- Event log ---- */}
      <div className="card" style={{ marginBottom: 22 }}>
        <h2>Event log</h2>
        <p className="hint">What this page observed from the outside.</p>
        <div className="log mono">
          {log.length === 0 && <div className="empty">No events yet. Try crashing a pod.</div>}
          {log.map((l, i) => (
            <div key={i}>
              <span className="t">{l.time}</span>
              <span className={l.kind === "info" ? "" : l.kind}>{l.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Pipeline ---- */}
      <div className="card" style={{ marginBottom: 22 }}>
        <h2>CI/CD pipeline that shipped this version</h2>
        <p className="hint">
          Running commit <code>{shortSha}</code>. Every push to main goes through these stages
          without a human touching the cluster.
        </p>
        <div className="pipeline">
          {PIPELINE.map((s, i) => (
            <div className={`step ${i === PIPELINE.length - 1 ? "live" : ""}`} key={s.name}>
              <div className="n">STEP {i + 1}</div>
              <div className="name">{s.name}</div>
              <div className="tool">{s.tool}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Runtime details ---- */}
      <div className="card">
        <h2>What this pod knows about itself</h2>
        <p className="hint">Injected by Kubernetes through the Downward API and a ConfigMap.</p>
        <table>
          <tbody>
            <tr><td>Pod name</td><td className="mono">{info?.pod ?? "..."}</td></tr>
            <tr><td>Pod IP</td><td className="mono">{info?.podIp ?? "..."}</td></tr>
            <tr><td>Worker node</td><td className="mono">{info?.node ?? "..."}</td></tr>
            <tr><td>Namespace</td><td className="mono">{info?.namespace ?? "..."}</td></tr>
            <tr><td>Image commit</td><td className="mono">{info?.gitSha ?? "..."}</td></tr>
            <tr><td>Node.js runtime</td><td className="mono">{info?.nodeVersion ?? "..."}</td></tr>
            <tr><td>Readiness</td><td>{info ? (info.ready ? "Ready" : "Not ready") : "..."}</td></tr>
            <tr><td>Chaos buttons</td><td>{info ? (info.chaosEnabled ? "Enabled (demo)" : "Disabled") : "..."}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="footer">Built with Next.js &middot; Docker &middot; Kubernetes &middot; GitHub Actions &middot; Argo CD</div>
    </div>
  );
}
