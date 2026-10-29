/**
 * Per-process runtime state, shared by all API routes.
 * Kept on globalThis because Next.js can load route modules separately.
 *
 * Note: this state lives inside ONE container. When Kubernetes restarts the
 * container, it resets. That is exactly what the UI demos.
 */
type RuntimeState = { ready: boolean; startedAt: number };

const g = globalThis as unknown as { __runtime?: RuntimeState };

export const runtime: RuntimeState =
  g.__runtime ?? (g.__runtime = { ready: true, startedAt: Date.now() });

export const chaosEnabled = () => process.env.ENABLE_CHAOS === "true";

export function podInfo() {
  return {
    pod: process.env.POD_NAME ?? process.env.HOSTNAME ?? "local-dev",
    node: process.env.NODE_NAME ?? "local-machine",
    namespace: process.env.POD_NAMESPACE ?? "none (not in Kubernetes)",
    podIp: process.env.POD_IP ?? "127.0.0.1",
    inKubernetes: Boolean(process.env.KUBERNETES_SERVICE_HOST),
  };
}
