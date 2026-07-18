const os = require('os')
const { monitorEventLoopDelay, performance } = require('perf_hooks')

function round(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round(Number(value || 0) * factor) / factor
}

function createOperationsMonitor(options = {}) {
  const slowRequestMs = Number(options.slowRequestMs || process.env.SLOW_REQUEST_MS || 1000)
  const startedAt = new Date()
  const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 })
  const stats = {
    requests: 0,
    errors: 0,
    totalLatencyMs: 0,
    statusCounts: {},
    routeCounts: {},
    slowRequests: []
  }

  let lastCpuUsage = process.cpuUsage()
  let lastCpuTime = process.hrtime.bigint()
  let lastCpuPercent = 0

  eventLoopDelay.enable()

  function middleware(req, res, next) {
    const started = performance.now()

    res.on('finish', () => {
      const durationMs = performance.now() - started
      const statusCode = res.statusCode
      const routeKey = `${req.method} ${req.baseUrl || ''}${req.route?.path || req.path}`

      stats.requests += 1
      stats.totalLatencyMs += durationMs
      stats.statusCounts[statusCode] = (stats.statusCounts[statusCode] || 0) + 1
      stats.routeCounts[routeKey] = (stats.routeCounts[routeKey] || 0) + 1

      if (statusCode >= 500) {
        stats.errors += 1
      }

      if (durationMs >= slowRequestMs) {
        stats.slowRequests.unshift({
          method: req.method,
          path: String(req.originalUrl || req.url || '').split('?')[0],
          statusCode,
          durationMs: round(durationMs),
          at: new Date().toISOString()
        })
        stats.slowRequests = stats.slowRequests.slice(0, 25)
      }
    })

    next()
  }

  function getCpuPercent() {
    const currentUsage = process.cpuUsage()
    const currentTime = process.hrtime.bigint()
    const elapsedMicros = Number(currentTime - lastCpuTime) / 1000
    const usedMicros = (currentUsage.user - lastCpuUsage.user) + (currentUsage.system - lastCpuUsage.system)

    lastCpuUsage = currentUsage
    lastCpuTime = currentTime

    if (elapsedMicros > 0) {
      lastCpuPercent = Math.min(100, (usedMicros / elapsedMicros) * 100)
    }

    return round(lastCpuPercent)
  }

  function snapshot() {
    const memory = process.memoryUsage()
    const averageLatencyMs = stats.requests > 0 ? stats.totalLatencyMs / stats.requests : 0
    const errorRate = stats.requests > 0 ? stats.errors / stats.requests : 0

    return {
      service: process.env.SERVICE_NAME || 'wcc-admin-api',
      environment: process.env.NODE_ENV || 'development',
      startedAt: startedAt.toISOString(),
      uptimeSeconds: round(process.uptime()),
      requests: stats.requests,
      errors: stats.errors,
      errorRate: round(errorRate, 4),
      averageLatencyMs: round(averageLatencyMs),
      memory: {
        rssMb: round(memory.rss / 1024 / 1024),
        heapUsedMb: round(memory.heapUsed / 1024 / 1024),
        heapTotalMb: round(memory.heapTotal / 1024 / 1024)
      },
      cpu: {
        processPercent: getCpuPercent(),
        loadAverage: os.loadavg().map((value) => round(value))
      },
      eventLoopLagMs: {
        mean: round(eventLoopDelay.mean / 1e6),
        max: round(eventLoopDelay.max / 1e6),
        p95: round(eventLoopDelay.percentile(95) / 1e6)
      },
      statusCounts: stats.statusCounts,
      topRoutes: Object.entries(stats.routeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([route, count]) => ({ route, count })),
      slowRequests: stats.slowRequests
    }
  }

  function stop() {
    eventLoopDelay.disable()
  }

  return { middleware, snapshot, stop }
}

module.exports = createOperationsMonitor
