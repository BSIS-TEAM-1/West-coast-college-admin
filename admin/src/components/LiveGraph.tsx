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
  const getAdjustedMaxValue = (data: number[], baseMaxValue: number) => {
    if (data.length === 0) return baseMaxValue
    
    const maxDataValue = Math.max(...data)
    const minDataValue = Math.min(...data)
    const dataRange = maxDataValue - minDataValue
    
    // If max data value is close to the base maxValue (within 10%), scale up
    if (maxDataValue >= baseMaxValue * 0.9) {
      return maxDataValue * 1.2
    }
    
    // If data range is very small, scale down for better visibility
    if (dataRange < baseMaxValue * 0.1 && maxDataValue < baseMaxValue * 0.5) {
      const scaledValue = Math.max(maxDataValue * 1.5, dataRange * 3)
      return Math.max(scaledValue, baseMaxValue * 0.2)
    }
    
    return baseMaxValue
  }

  // Initialize animation on mount
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

      // Clear canvas
      ctx.clearRect(0, 0, width, height)

      // Get dynamically adjusted maxValue
      const adjustedMaxValue = getAdjustedMaxValue(dataRef.current, maxValue)

      // Professional light background with subtle gradient
      const bgGradient = ctx.createLinearGradient(0, 0, 0, height)
      bgGradient.addColorStop(0, '#f8f9fa')
      bgGradient.addColorStop(1, '#f1f3f5')
      ctx.fillStyle = bgGradient
      ctx.fillRect(0, 0, width, height)

      // Subtle grid lines
      ctx.strokeStyle = 'rgba(108, 117, 125, 0.1)'
      ctx.lineWidth = 0.5
      ctx.setLineDash([5, 5])

      // Horizontal grid lines only
      for (let i = 1; i < 5; i++) {
        const y = (height / 5) * i
        ctx.beginPath()
        ctx.moveTo(30, y)
        ctx.lineTo(width - 20, y)
        ctx.stroke()
      }
      ctx.setLineDash([])

      if (dataRef.current.length > 1) {
        const chartWidth = width - 50
        const chartHeight = height - 120
        const startX = 30
        const startY = 20

        const xStep = chartWidth / (dataRef.current.length - 1)

        // Area under the line with subtle gradient
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

        // Main line with smooth rendering
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

        // Last data point with pulsing glow
        const lastIndex = dataRef.current.length - 1
        const lastX = startX + lastIndex * xStep
        const lastY = startY + chartHeight - (dataRef.current[lastIndex] / adjustedMaxValue) * chartHeight

        // Pulsing glow
        const pulseRadius = 12 + Math.sin(pulse) * 4
        const glowGradient = ctx.createRadialGradient(lastX, lastY, 0, lastX, lastY, pulseRadius)
        glowGradient.addColorStop(0, color + '60')
        glowGradient.addColorStop(0.7, color + '20')
        glowGradient.addColorStop(1, 'transparent')
        ctx.fillStyle = glowGradient
        ctx.beginPath()
        ctx.arc(lastX, lastY, pulseRadius, 0, 2 * Math.PI)
        ctx.fill()

        // Center dot
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(lastX, lastY, 5, 0, 2 * Math.PI)
        ctx.fill()
      }

      // Title
      ctx.fillStyle = '#1f2937'
      ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(title, 30, 40)

      // Current Value
      const lastValue = dataRef.current[dataRef.current.length - 1] || 0
      ctx.fillStyle = color
      ctx.font = 'bold 32px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`${lastValue.toFixed(1)}${unit}`, 30, height - 60)

      // Trend
      if (dataRef.current.length > 1) {
        const trend = dataRef.current[dataRef.current.length - 1] - dataRef.current[dataRef.current.length - 2]
        const trendPercentage = dataRef.current[dataRef.current.length - 2] ? (trend / dataRef.current[dataRef.current.length - 2]) * 100 : 0
        const trendColor = trend > 0 ? '#10b981' : trend < 0 ? '#ef4444' : '#64748b'
        const trendSign = trend > 0 ? '▲' : trend < 0 ? '▼' : '→'

        ctx.fillStyle = trendColor
        ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(`${trendSign} ${Math.abs(trend).toFixed(1)} (${Math.abs(trendPercentage).toFixed(1)}%)`, 30, height - 35)
      }

      // Y-axis labels
      ctx.fillStyle = '#6b7280'
      ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
      ctx.textAlign = 'right'
      
      for (let i = 0; i <= 5; i++) {
        const value = (getAdjustedMaxValue(dataRef.current, maxValue) / 5) * (5 - i)
        const y = (height / 5) * i + 25
        ctx.fillText(`${value.toFixed(1)}${unit}`, width - 15, y + 5)
      }
    }

    const animate = () => {
      pulseRef.current = (pulseRef.current + 0.05) % (Math.PI * 2)
      drawGraph(pulseRef.current)
      animationIdRef.current = requestAnimationFrame(animate)
    }

    // Handle resize
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
    
    // Start animation
    animate()

    return () => {
      resizeObserver.disconnect()
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
        animationIdRef.current = null
      }
    }
  }, []) // Empty dependency array - runs only once on mount

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '400px',
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
