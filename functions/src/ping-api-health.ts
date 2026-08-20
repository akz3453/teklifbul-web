// Teklifbul Rule v1.0 — Production API uptime probe (Cloud Scheduler)
const HEALTH_PROBE_TIMEOUT_MS = 8000;
const DEFAULT_HEALTH_CHECK_URL = 'https://nefisoft.com/api/health';

export type HealthProbeResult = {
  ok: boolean;
  statusCode: number;
  latencyMs: number;
};

export async function runApiHealthProbe(
  fetchImpl: typeof fetch = fetch
): Promise<HealthProbeResult> {
  const url = String(process.env.HEALTH_CHECK_URL || DEFAULT_HEALTH_CHECK_URL).trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_PROBE_TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Teklifbul-HealthMonitor/1.0',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; status?: string };
    const ok = res.ok && (body.status === 'ok' || body.ok === true);
    return { ok, statusCode: res.status, latencyMs };
  } finally {
    clearTimeout(timer);
  }
}
