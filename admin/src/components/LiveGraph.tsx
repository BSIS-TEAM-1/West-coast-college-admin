import { useEffect, useRef, useState } from 'react'

interface LiveGraphProps {
  title: string
  data: number[]
  maxValue: number
  unit: string
  color: string
}

interface MaximizedGraphProps {
  title: string
  data: number[]
  maxValue: number
  unit: string
  color: string
  onClose: () => void
}

function MaximizedGraph({ title, data, maxValue, unit, color, onClose }: MaximizedGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationFrameRef = useRef<number | undefined>(undefined)

  // Dynamic scaling function to adjust maxValue when data approaches limits
  const getAdjustedMaxValue = (data: number[], baseMaxValue: number) => {
    if (data.length === 0) return baseMaxValue
    
    const maxDataValue = Math.max(...data)
    const minDataValue = Math.min(...data)
    const dataRange = maxDataValue - minDataValue
    
    // If max data value is close to the base maxValue (within 10%), scale up
    if (maxDataValue >= baseMaxValue * 0.9) {
      // Add 20% padding above the max value
      return maxDataValue * 1.2
    }
    
    // If data range is very small compared to maxValue, scale down for better visibility
    if (dataRange < baseMaxValue * 0.1 && maxDataValue < baseMaxValue * 0.5) {
      // Use the higher of max value * 1.5 or data range * 3
      return Math.max(maxDataValue * 1.5, dataRange * 3)
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

      // Clear canvas
      ctx.clearRect(0, 0, width, height)

      // Get dynamically adjusted maxValue
      const adjustedMaxValue = getAdjustedMaxValue(data, maxValue)

      // Background
      const bgGradient = ctx.createLinearGradient(0, 0, 0, height)
      bgGradient.addColorStop(0, '#1e293b') // slate-800
      bgGradient.addColorStop(1, '#0f172a') // slate-900
      ctx.fillStyle = bgGradient
      ctx.fillRect(0, 0, width, height)

      // Grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
      ctx.lineWidth = 0.5
      ctx.setLineDash([3, 6])

      // Horizontal grid lines
      for (let i = 1; i < 8; i++) {
        const y = (height / 8) * i
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }

      // Vertical grid lines
      for (let i = 1; i < 10; i++) {
        const x = (width / 10) * i
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }
      ctx.setLineDash([])

      if (data.length > 1) {
        const xStep = width / (data.length - 1)

        // Area under the line
        const areaGradient = ctx.createLinearGradient(0, 0, 0, height)
        areaGradient.addColorStop(0, color + '40')
        areaGradient.addColorStop(1, color + '00')
        ctx.fillStyle = areaGradient
        ctx.beginPath()
        ctx.moveTo(0, height)
        data.forEach((value, index) => {
          const x = index * xStep
          const y = height - (value / adjustedMaxValue) * height
          ctx.lineTo(x, y)
        })
        ctx.lineTo(width, height)
        ctx.closePath()
        ctx.fill()

        // Main line
        ctx.strokeStyle = color
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        data.forEach((value, index) => {
          const x = index * xStep
          const y = height - (value / adjustedMaxValue) * height
          if (index === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        })
        ctx.stroke()

        // Data points
        data.forEach((value, index) => {
          const x = index * xStep
          const y = height - (value / adjustedMaxValue) * height
          
          // Outer glow
          const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, 8)
          glowGradient.addColorStop(0, color + '60')
          glowGradient.addColorStop(1, 'transparent')
          ctx.fillStyle = glowGradient
          ctx.beginPath()
          ctx.arc(x, y, 8, 0, 2 * Math.PI)
          ctx.fill()

          // Center dot
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(x, y, 3, 0, 2 * Math.PI)
          ctx.fill()
        })

        // Last data point highlight
        const lastIndex = data.length - 1
        const lastX = lastIndex * xStep
        const lastY = height - (data[lastIndex] / adjustedMaxValue) * height

        // Pulsing glow
        const pulseRadius = 15 + Math.sin(pulse) * 5
        const glowGradient = ctx.createRadialGradient(lastX, lastY, 0, lastX, lastY, pulseRadius)
        glowGradient.addColorStop(0, color + '80')
        glowGradient.addColorStop(0.7, color + '20')
        glowGradient.addColorStop(1, 'transparent')
        ctx.fillStyle = glowGradient
        ctx.beginPath()
        ctx.arc(lastX, lastY, pulseRadius, 0, 2 * Math.PI)
        ctx.fill()

        // Center dot
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(lastX, lastY, 6, 0, 2 * Math.PI)
        ctx.fill()
      }

      // Title
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.font = 'bold 24px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(title, 30, 50)

      // Current Value
      const lastValue = data[data.length - 1] || 0
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 36px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`${lastValue.toFixed(1)}${unit}`, 30, 90)

      // Trend
      if (data.length > 1) {
        const trend = data[data.length - 1] - data[data.length - 2]
        const trendPercentage = data[data.length - 2] ? (trend / data[data.length - 2]) * 100 : 0
        const trendColor = trend > 0 ? '#10b981' : trend < 0 ? '#ef4444' : '#64748b'
        const trendSign = trend > 0 ? '+' : ''

        ctx.fillStyle = trendColor
        ctx.font = '18px sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(`${trendSign}${trend.toFixed(1)} (${trendSign}${trendPercentage.toFixed(1)}%)`, 30, 115)
      }

      // Data labels
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
      ctx.font = '14px sans-serif'
      ctx.textAlign = 'right'
      
      // Y-axis labels
      for (let i = 0; i <= 5; i++) {
        const value = (adjustedMaxValue / 5) * (5 - i)
        const y = (height / 5) * i
        ctx.fillText(`${value.toFixed(1)}${unit}`, width - 20, y + 5)
      }
    }

    let pulse = 0
    const animate = () => {
      pulse = (pulse + 0.05) % (Math.PI * 2)
      drawGraph(pulse)
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    const resizeObserver = new ResizeObserver(entries => {
      if (!entries || entries.length === 0) return
      const { width: newWidth, height: newHeight } = entries[0].contentRect
      width = newWidth
      height = newHeight
      // Redraw on resize
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      animate()
    })

    resizeObserver.observe(container)
    animate()

    return () => {
      resizeObserver.disconnect()
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [data, maxValue, unit, color])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          background: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: '8px',
          color: 'white',
          padding: '10px 15px',
          cursor: 'pointer',
          fontSize: '14px',
          zIndex: 10,
          transition: 'background 0.3s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
        }}
      >
        ✕ Close
      </button>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '16px',
          overflow: 'hidden',
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
    </div>
  )
}

export default function LiveGraph({ title, data, maxValue, unit, color }: LiveGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationFrameRef = useRef<number | undefined>(undefined)
  const [isMaximized, setIsMaximized] = useState(false)

  // Dynamic scaling function to adjust maxValue when data approaches limits
  const getAdjustedMaxValue = (data: number[], baseMaxValue: number) => {
    if (data.length === 0) return baseMaxValue
    
    const maxDataValue = Math.max(...data)
    const minDataValue = Math.min(...data)
    const dataRange = maxDataValue - minDataValue
    
    // If max data value is close to the base maxValue (within 10%), scale up
    if (maxDataValue >= baseMaxValue * 0.9) {
      // Add 20% padding above the max value
      return maxDataValue * 1.2
    }
    
    // If data range is very small compared to maxValue, scale down for better visibility
    if (dataRange < baseMaxValue * 0.1 && maxDataValue < baseMaxValue * 0.5) {
      // Use the higher of max value * 1.5 or data range * 3
      return Math.max(maxDataValue * 1.5, dataRange * 3)
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

      // Clear canvas
      ctx.clearRect(0, 0, width, height)

      // Get dynamically adjusted maxValue
      const adjustedMaxValue = getAdjustedMaxValue(data, maxValue)

      // Background
      const bgGradient = ctx.createLinearGradient(0, 0, 0, height)
      bgGradient.addColorStop(0, '#1e293b') // slate-800
      bgGradient.addColorStop(1, '#0f172a') // slate-900
      ctx.fillStyle = bgGradient
      ctx.fillRect(0, 0, width, height)

      // Grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
      ctx.lineWidth = 0.5
      ctx.setLineDash([3, 6])

      // Horizontal grid lines
      for (let i = 1; i < 5; i++) {
        const y = (height / 5) * i
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }
      ctx.setLineDash([])

      if (data.length > 1) {
        const xStep = width / (data.length - 1)

        // Area under the line
        const areaGradient = ctx.createLinearGradient(0, 0, 0, height)
        areaGradient.addColorStop(0, color + '40')
        areaGradient.addColorStop(1, color + '00')
        ctx.fillStyle = areaGradient
        ctx.beginPath()
        ctx.moveTo(0, height)
        data.forEach((value, index) => {
          const x = index * xStep
          const y = height - (value / adjustedMaxValue) * height
          ctx.lineTo(x, y)
        })
        ctx.lineTo(width, height)
        ctx.closePath()
        ctx.fill()

        // Main line
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        data.forEach((value, index) => {
          const x = index * xStep
          const y = height - (value / adjustedMaxValue) * height
          if (index === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        })
        ctx.stroke()

        // Last data point highlight
        const lastIndex = data.length - 1
        const lastX = lastIndex * xStep
        const lastY = height - (data[lastIndex] / adjustedMaxValue) * height

        // Pulsing glow
        const pulseRadius = 10 + Math.sin(pulse) * 3
        const glowGradient = ctx.createRadialGradient(lastX, lastY, 0, lastX, lastY, pulseRadius)
        glowGradient.addColorStop(0, color + '80')
        glowGradient.addColorStop(0.7, color + '20')
        glowGradient.addColorStop(1, 'transparent')
        ctx.fillStyle = glowGradient
        ctx.beginPath()
        ctx.arc(lastX, lastY, pulseRadius, 0, 2 * Math.PI)
        ctx.fill()

        // Center dot
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(lastX, lastY, 4, 0, 2 * Math.PI)
        ctx.fill()
      }

      // Title
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.font = 'bold 16px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(title, 20, 30)

      // Current Value
      const lastValue = data[data.length - 1] || 0
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 24px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`${lastValue.toFixed(1)}${unit}`, 20, 60)

      // Trend
      if (data.length > 1) {
        const trend = data[data.length - 1] - data[data.length - 2]
        const trendPercentage = data[data.length - 2] ? (trend / data[data.length - 2]) * 100 : 0
        const trendColor = trend > 0 ? '#10b981' : trend < 0 ? '#ef4444' : '#64748b'
        const trendSign = trend > 0 ? '+' : ''

        ctx.fillStyle = trendColor
        ctx.font = '14px sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(`${trendSign}${trend.toFixed(1)} (${trendSign}${trendPercentage.toFixed(1)}%)`, 20, 80)
      }
    }

    let pulse = 0
    const animate = () => {
      pulse = (pulse + 0.05) % (Math.PI * 2)
      drawGraph(pulse)
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    const resizeObserver = new ResizeObserver(entries => {
      if (!entries || entries.length === 0) return
      const { width: newWidth, height: newHeight } = entries[0].contentRect
      width = newWidth
      height = newHeight
      // Redraw on resize
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      animate()
    })

    resizeObserver.observe(container)
    animate()

    return () => {
      resizeObserver.disconnect()
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [data, maxValue, unit, color])

  return (
    <>
      <div
        ref={containerRef}
        className="live-graph"
        style={{
          position: 'relative',
          width: '100%',
          height: '250px', // Set a default height for the container
          borderRadius: '16px',
          overflow: 'hidden',
          background: '#0f172a',
          boxShadow: '0 10px 20px rgba(0,0,0,0.19), 0 6px 6px rgba(0,0,0,0.23)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          transition: 'transform 0.3s ease, box-shadow 0.3s ease',
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
        <button
          onClick={() => setIsMaximized(true)}
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            color: 'white',
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: '12px',
            transition: 'background 0.3s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
          }}
        >
          ⛶ Maximize
        </button>
      </div>

      {isMaximized && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setIsMaximized(false)}
        >
          <div
            style={{
              width: '90vw',
              height: '80vh',
              maxWidth: '1200px',
              maxHeight: '800px',
              background: '#0f172a',
              borderRadius: '16px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              overflow: 'hidden',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <MaximizedGraph 
              title={title} 
              data={data} 
              maxValue={maxValue} 
              unit={unit} 
              color={color}
              onClose={() => setIsMaximized(false)}
            />
          </div>
        </div>
      )}
    </>
  )
}
