import { chaosEnabled, podInfo } from "@/lib/runtime";

export const dynamic = "force-dynamic";

/**
 * Demo helper: kills THIS container's process on purpose.
 * Kubernetes notices the container exited and restarts it (self-healing),
 * while the other replicas keep serving traffic.
 *
 * Disabled unless ENABLE_CHAOS=true (set in k8s/configmap.yaml).
 * Never enable something like this in a real production environment.
 */
export function POST() {
  const noStore = { "Cache-Control": "no-store" };
  if (!chaosEnabled()) {
    return Response.json({ error: "chaos_disabled" }, { status: 403, headers: noStore });
  }

  const { pod } = podInfo();
  console.log(JSON.stringify({ level: "warn", msg: "crash requested", pod }));

  // Respond first, then exit, so the browser gets an answer.
  setTimeout(() => process.exit(1), 400);
  return Response.json({ status: "crashing", pod }, { status: 202, headers: noStore });
}
