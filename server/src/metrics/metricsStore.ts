/**
 * In-Memory Metrics Store
 * Teklifbul Rule v1.0 - Observability v1 + Windowed Metrics v2
 * 
 * Request metrics toplama ve istatistik hesaplama
 * Zaman pencereli metrikler (5m/15m)
 */

interface RequestEvent {
  ts: number; // Timestamp (Date.now())
  routeKey: string;
  method: string;
  status: number;
  durationMs: number;
}

interface RouteStats {
  count: number;
  durations: number[]; // Ring buffer (max 200)
  maxMs: number;
}

interface WindowSnapshot {
  total: number;
  statusCounts: Record<number, number>;
  errorRate5xx: number; // Percentage of 5xx errors
  topRoutesByCount: Array<{ route: string; count: number }>;
  slowRoutesByP95: Array<{ route: string; p95Ms: number; count: number }>;
  durationPercentiles: {
    p50: number;
    p95: number;
    p99: number;
  };
}

interface MetricsSnapshot {
  uptimeSec: number;
  totalRequests: number;
  statusCounts: Record<number, number>;
  topRoutesByCount: Array<{ route: string; count: number }>;
  slowRoutesByP95: Array<{ route: string; p95Ms: number; count: number }>;
  routeStats: Record<string, {
    count: number;
    avgMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    maxMs: number;
  }>;
  windows: {
    '5m': WindowSnapshot;
    '15m': WindowSnapshot;
  };
}

class MetricsStore {
  private totalRequests = 0;
  private statusCounts: Record<number, number> = {};
  private routeStats: Map<string, RouteStats> = new Map();
  private readonly MAX_SAMPLES_PER_ROUTE = 200;
  
  // Teklifbul Rule v1.0 - Windowed Metrics v2: Global event ring buffer
  private events: RequestEvent[] = [];
  private readonly MAX_EVENTS = Number(process.env.OBS_EVENTS_MAX) || 10000;

  /**
   * Record a request metric
   * Teklifbul Rule v1.0 - Windowed Metrics v2: Timestamp ekle
   */
  recordRequest(params: {
    routeKey: string;
    statusCode: number;
    durationMs: number;
    ts?: number; // Timestamp (Date.now()), optional for backward compatibility
    method?: string; // HTTP method, optional
  }): void {
    const { routeKey, statusCode, durationMs, ts = Date.now(), method = 'UNKNOWN' } = params;

    // Total requests
    this.totalRequests++;

    // Status counts
    this.statusCounts[statusCode] = (this.statusCounts[statusCode] || 0) + 1;

    // Route stats
    let stats = this.routeStats.get(routeKey);
    if (!stats) {
      stats = {
        count: 0,
        durations: [],
        maxMs: 0
      };
      this.routeStats.set(routeKey, stats);
    }

    stats.count++;
    stats.maxMs = Math.max(stats.maxMs, durationMs);

    // Ring buffer: max 200 samples per route
    stats.durations.push(durationMs);
    if (stats.durations.length > this.MAX_SAMPLES_PER_ROUTE) {
      stats.durations.shift(); // Remove oldest
    }

    // Teklifbul Rule v1.0 - Windowed Metrics v2: Global event ring buffer
    this.events.push({
      ts,
      routeKey,
      method,
      status: statusCode,
      durationMs
    });

    // Ring buffer: max events
    if (this.events.length > this.MAX_EVENTS) {
      this.events.shift(); // Remove oldest
    }
  }

  /**
   * Calculate percentile from sorted array
   */
  private calculatePercentile(sorted: number[], percentile: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];

    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  /**
   * Get window snapshot (time-windowed metrics)
   * Teklifbul Rule v1.0 - Windowed Metrics v2
   * 
   * @param windowMs - Time window in milliseconds (e.g., 300000 for 5m, 900000 for 15m)
   */
  private getWindowSnapshot(windowMs: number): WindowSnapshot {
    const now = Date.now();
    const cutoff = now - windowMs;

    // Filter events within window
    const windowEvents = this.events.filter(e => e.ts >= cutoff);

    if (windowEvents.length === 0) {
      return {
        total: 0,
        statusCounts: {},
        errorRate5xx: 0,
        topRoutesByCount: [],
        slowRoutesByP95: [],
        durationPercentiles: {
          p50: 0,
          p95: 0,
          p99: 0
        }
      };
    }

    // Calculate totals and status counts
    const total = windowEvents.length;
    const statusCounts: Record<number, number> = {};
    const routeCounts: Record<string, number> = {};
    const routeDurations: Record<string, number[]> = {};
    const allDurations: number[] = [];

    windowEvents.forEach(event => {
      // Status counts
      statusCounts[event.status] = (statusCounts[event.status] || 0) + 1;

      // Route counts
      routeCounts[event.routeKey] = (routeCounts[event.routeKey] || 0) + 1;

      // Route durations
      if (!routeDurations[event.routeKey]) {
        routeDurations[event.routeKey] = [];
      }
      routeDurations[event.routeKey].push(event.durationMs);
      allDurations.push(event.durationMs);
    });

    // Calculate error rate (5xx percentage)
    const error5xx = Object.keys(statusCounts)
      .filter(code => {
        const codeNum = parseInt(code);
        return codeNum >= 500 && codeNum < 600;
      })
      .reduce((sum, code) => sum + (statusCounts[parseInt(code)] || 0), 0);
    const errorRate5xx = total > 0 ? Math.round((error5xx / total) * 10000) / 100 : 0; // Percentage with 2 decimals

    // Top routes by count
    const topRoutesByCount = Object.entries(routeCounts)
      .map(([route, count]) => ({ route, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Slow routes by p95
    const slowRoutesByP95: Array<{ route: string; p95Ms: number; count: number }> = [];
    for (const [route, durations] of Object.entries(routeDurations)) {
      if (durations.length >= 5) { // Min 5 requests for p95
        const sorted = [...durations].sort((a, b) => a - b);
        const p95Ms = this.calculatePercentile(sorted, 95);
        slowRoutesByP95.push({
          route,
          p95Ms: Math.round(p95Ms * 100) / 100,
          count: durations.length
        });
      }
    }
    slowRoutesByP95.sort((a, b) => b.p95Ms - a.p95Ms);
    const topSlowRoutes = slowRoutesByP95.slice(0, 10);

    // Duration percentiles (all events in window)
    const sortedDurations = [...allDurations].sort((a, b) => a - b);
    const p50 = this.calculatePercentile(sortedDurations, 50);
    const p95 = this.calculatePercentile(sortedDurations, 95);
    const p99 = this.calculatePercentile(sortedDurations, 99);

    return {
      total,
      statusCounts,
      errorRate5xx,
      topRoutesByCount,
      slowRoutesByP95: topSlowRoutes,
      durationPercentiles: {
        p50: Math.round(p50 * 100) / 100,
        p95: Math.round(p95 * 100) / 100,
        p99: Math.round(p99 * 100) / 100
      }
    };
  }

  /**
   * Get metrics snapshot
   */
  getSnapshot(): MetricsSnapshot {
    const routeStatsObj: Record<string, any> = {};
    const topRoutesByCount: Array<{ route: string; count: number }> = [];
    const slowRoutesByP95: Array<{ route: string; p95Ms: number; count: number }> = [];

    // Process each route
    for (const [route, stats] of this.routeStats.entries()) {
      const sorted = [...stats.durations].sort((a, b) => a - b);
      const sum = sorted.reduce((acc, val) => acc + val, 0);
      const avgMs = sorted.length > 0 ? sum / sorted.length : 0;
      const p50Ms = this.calculatePercentile(sorted, 50);
      const p95Ms = this.calculatePercentile(sorted, 95);
      const p99Ms = this.calculatePercentile(sorted, 99);

      routeStatsObj[route] = {
        count: stats.count,
        avgMs: Math.round(avgMs * 100) / 100,
        p50Ms: Math.round(p50Ms * 100) / 100,
        p95Ms: Math.round(p95Ms * 100) / 100,
        p99Ms: Math.round(p99Ms * 100) / 100,
        maxMs: stats.maxMs
      };

      topRoutesByCount.push({ route, count: stats.count });
      slowRoutesByP95.push({ route, p95Ms, count: stats.count });
    }

    // Sort top routes by count (descending)
    topRoutesByCount.sort((a, b) => b.count - a.count);

    // Sort slow routes by p95 (descending), filter out routes with < 5 requests
    slowRoutesByP95
      .filter(r => r.count >= 5)
      .sort((a, b) => b.p95Ms - a.p95Ms);

    // Teklifbul Rule v1.0 - Windowed Metrics v2: Get window snapshots
    const window5m = this.getWindowSnapshot(5 * 60 * 1000); // 5 minutes
    const window15m = this.getWindowSnapshot(15 * 60 * 1000); // 15 minutes

    return {
      uptimeSec: Math.floor(process.uptime()),
      totalRequests: this.totalRequests,
      statusCounts: { ...this.statusCounts },
      topRoutesByCount: topRoutesByCount.slice(0, 20), // Top 20
      slowRoutesByP95: slowRoutesByP95.slice(0, 20), // Top 20 slowest
      routeStats: routeStatsObj,
      windows: {
        '5m': window5m,
        '15m': window15m
      }
    };
  }

  /**
   * Reset all metrics (for testing or manual reset)
   */
  reset(): void {
    this.totalRequests = 0;
    this.statusCounts = {};
    this.routeStats.clear();
    this.events = [];
  }
}

// Singleton instance
export const metricsStore = new MetricsStore();

