import { useEffect, useRef } from 'react'

interface LiveGraphProps {
  title: string
  data: number[]
  maxValue: number
  unit: string
  color: string
}

export default function LiveGraph({ title, data, maxValue, unit, color }: LiveGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Use refs to track data without triggering re-renders
  const dataRef = useRef(data)
  const animationIdRef = useRef<number | null>(null)
  const pulseRef = useRef(0)

  // Update data ref whenever data changes
  useEffect(() => {
    dataRef.current = data
  }, [data])

  // Dynamic scaling function to adjust maxValue when data approaches limits
  const getAdjustedMaxValue = (values: number[], baseMaxValue: number) => {
    if (values.length === 0) return baseMaxValue

    const maxDataValue = Math.max(...values)
    const minDataValue = Math.min(...values)
    const dataRange = maxDataValue - minDataValue

    // If max data value is close to the base maxValue (within 10%), scale up.
    if (maxDataValue >= baseMaxValue * 0.9) {
      return maxDataValue * 1.2
    }

    // If data range is very small, scale down for better visibility.
    if (dataRange < baseMaxValue * 0.1 && maxDataValue < baseMaxValue * 0.5) {
      const scaledValue = Math.max(maxDataValue * 1.5, dataRange * 3)
      return Math.max(scaledValue, baseMaxValue * 0.2)
    }

    return baseMaxValue
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = container.clientWidth
    let height = container.clientHeight

    const drawGraph = (pulse = 0) => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx.scale(dpr, dpr)

      ctx.clearRect(0, 0, width, height)

      const adjustedMaxValue = getAdjustedMaxValue(dataRef.current, maxValue)
      const compact = width < 560
      const small = width < 420
      const leftPadding = small ? 16 : compact ? 20 : 30
      const rightPadding = small ? 12 : 20
      const topPadding = small ? 18 : 20
      const titleFontSize = small ? 15 : compact ? 17 : 20
      const valueFontSize = small ? 24 : compact ? 28 : 32
      const trendFontSize = small ? 11 : compact ? 12 : 14
      const axisFontSize = small ? 10 : 12
      const chartStartY = small ? 48 : compact ? 54 : 60
      const chartBottomReserve = small ? 74 : compact ? 92 : 120

      const bgGradient = ctx.createLinearGradient(0, 0, 0, height)
      bgGradient.addColorStop(0, '#f8f9fa')
      bgGradient.addColorStop(1, '#f1f3f5')
      ctx.fillStyle = bgGradient
      ctx.fillRect(0, 0, width, height)

      ctx.strokeStyle = 'rgba(108, 117, 125, 0.1)'
      ctx.lineWidth = 0.5
      ctx.setLineDash([5, 5])

      for (let i = 1; i < 5; i++) {
        const y = (height / 5) * i
        ctx.beginPath()
        ctx.moveTo(leftPadding, y)
        ctx.lineTo(width - rightPadding, y)
        ctx.stroke()
      }
      ctx.setLineDash([])

      if (dataRef.current.length > 1) {
        const chartWidth = Math.max(width - leftPadding - rightPadding - (small ? 16 : 18), 80)
        const chartHeight = Math.max(height - chartStartY - chartBottomReserve, 80)
        const startX = leftPadding
        const startY = chartStartY
        const xStep = chartWidth / (dataRef.current.length - 1)

        const areaGradient = ctx.createLinearGradient(0, startY, 0, startY + chartHeight)
        areaGradient.addColorStop(0, color + '30')
        areaGradient.addColorStop(1, color + '05')
        ctx.fillStyle = areaGradient
        ctx.beginPath()
        ctx.moveTo(startX, startY + chartHeight)
        dataRef.current.forEach((value, index) => {
          const x = startX + index * xStep
          const y = startY + chartHeight - (value / adjustedMaxValue) * chartHeight
          ctx.lineTo(x, y)
        })
        ctx.lineTo(startX + (dataRef.current.length - 1) * xStep, startY + chartHeight)
        ctx.closePath()
        ctx.fill()

        ctx.strokeStyle = color
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        dataRef.current.forEach((value, index) => {
          const x = startX + index * xStep
          const y = startY + chartHeight - (value / adjustedMaxValue) * chartHeight
          if (index === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        })
        ctx.stroke()

        const lastIndex = dataRef.current.length - 1
        const lastX = startX + lastIndex * xStep
        const lastY = startY + chartHeight - (dataRef.current[lastIndex] / adjustedMaxValue) * chartHeight

        const pulseRadius = 12 + Math.sin(pulse) * 4
        const glowGradient = ctx.createRadialGradient(lastX, lastY, 0, lastX, lastY, pulseRadius)
        glowGradient.addColorStop(0, color + '60')
        glowGradient.addColorStop(0.7, color + '20')
        glowGradient.addColorStop(1, 'transparent')
        ctx.fillStyle = glowGradient
        ctx.beginPath()
        ctx.arc(lastX, lastY, pulseRadius, 0, 2 * Math.PI)
        ctx.fill()

        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(lastX, lastY, 5, 0, 2 * Math.PI)
        ctx.fill()
      }

      ctx.fillStyle = '#1f2937'
      ctx.font = `bold ${titleFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
      ctx.textAlign = 'left'
      ctx.fillText(title, leftPadding, topPadding + titleFontSize)

      const lastValue = dataRef.current[dataRef.current.length - 1] || 0
      ctx.fillStyle = color
      ctx.font = `bold ${valueFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
      ctx.textAlign = 'left'
      ctx.fillText(`${lastValue.toFixed(1)}${unit}`, leftPadding, height - (small ? 42 : compact ? 50 : 60))

      if (dataRef.current.length > 1) {
        const trend = dataRef.current[dataRef.current.length - 1] - dataRef.current[dataRef.current.length - 2]
        const previousValue = dataRef.current[dataRef.current.length - 2]
        const trendPercentage = previousValue ? (trend / previousValue) * 100 : 0
        const trendColor = trend > 0 ? '#10b981' : trend < 0 ? '#ef4444' : '#64748b'
        const trendSign = trend > 0 ? '^' : trend < 0 ? 'v' : '->'

        ctx.fillStyle = trendColor
        ctx.font = `${trendFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
        ctx.textAlign = 'left'
        ctx.fillText(
          `${trendSign} ${Math.abs(trend).toFixed(1)} (${Math.abs(trendPercentage).toFixed(1)}%)`,
          leftPadding,
          height - (small ? 20 : compact ? 26 : 35)
        )
      }

      ctx.fillStyle = '#6b7280'
      ctx.font = `${axisFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
      ctx.textAlign = 'right'

      for (let i = 0; i <= 5; i++) {
        const value = (adjustedMaxValue / 5) * (5 - i)
        const y = (height / 5) * i + 25
        ctx.fillText(`${value.toFixed(1)}${unit}`, width - rightPadding, y + 5)
      }
    }

    const animate = () => {
      pulseRef.current = (pulseRef.current + 0.05) % (Math.PI * 2)
      drawGraph(pulseRef.current)
      animationIdRef.current = requestAnimationFrame(animate)
    }

    const handleResize = () => {
      const newWidth = container.clientWidth
      const newHeight = container.clientHeight

      if (newWidth > 0 && newHeight > 0) {
        width = newWidth
        height = newHeight
      }
    }

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(container)
    animate()

    return () => {
      resizeObserver.disconnect()
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
        animationIdRef.current = null
      }
    }
  }, [color, maxValue, title, unit])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: 'clamp(240px, 52vw, 400px)',
        borderRadius: '12px',
        overflow: 'hidden',
        background: '#ffffff',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)',
        border: '1px solid rgba(0, 0, 0, 0.06)',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
    </div>
  )
}
