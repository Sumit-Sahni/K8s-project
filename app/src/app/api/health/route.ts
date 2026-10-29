export const dynamic = "force-dynamic";

/**
 * LIVENESS probe: "is the process alive?"
 * If this keeps failing, Kubernetes RESTARTS the container.
 * Keep it simple and free of dependencies.
 */
export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
