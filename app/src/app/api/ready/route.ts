import { chaosEnabled, podInfo, runtime } from "@/lib/runtime";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

/**
 * READINESS probe: "can this pod receive traffic right now?"
 * While this returns 503, Kubernetes REMOVES the pod from the Service
 * endpoints (no restart, just no traffic).
 */
export function GET() {
  if (!runtime.ready) {
    return Response.json({ status: "not_ready" }, { status: 503, headers: noStore });
  }
  return Response.json({ status: "ready" }, { headers: noStore });
}

/**
 * Demo helper: flips this pod's readiness. Only works when ENABLE_CHAOS=true.
 * Hit it through the UI to watch the Service stop sending traffic to this pod.
 */
export function POST() {
  if (!chaosEnabled()) {
    return Response.json({ error: "chaos_disabled" }, { status: 403, headers: noStore });
  }
  runtime.ready = !runtime.ready;
  return Response.json(
    { pod: podInfo().pod, ready: runtime.ready },
    { headers: noStore }
  );
}
