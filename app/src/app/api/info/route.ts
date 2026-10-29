import { chaosEnabled, podInfo, runtime } from "@/lib/runtime";

export const dynamic = "force-dynamic";

/**
 * Everything the dashboard shows about the running pod.
 *
 * "Connection: close" makes the browser open a NEW connection for every
 * request. Without it the browser reuses one keep-alive connection and
 * would stick to a single pod, hiding Kubernetes load balancing.
 */
export function GET() {
  const body = {
    ...podInfo(),
    version: process.env.APP_VERSION ?? "dev",
    gitSha: process.env.GIT_SHA ?? "local",
    buildTime: process.env.BUILD_TIME ?? "unknown",
    // These two come from the Kubernetes ConfigMap (k8s/configmap.yaml)
    environment: process.env.APP_ENV ?? "local",
    message: process.env.WELCOME_MESSAGE ?? "Running outside Kubernetes",
    ready: runtime.ready,
    chaosEnabled: chaosEnabled(),
    uptimeSeconds: Math.round((Date.now() - runtime.startedAt) / 1000),
    nodeVersion: process.version,
    serverTime: new Date().toISOString(),
  };

  return Response.json(body, {
    headers: { "Cache-Control": "no-store", Connection: "close" },
  });
}
