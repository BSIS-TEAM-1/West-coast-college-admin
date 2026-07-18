const zlib = require('zlib')
const { Readable, pipeline } = require('stream')

const DEFAULT_THRESHOLD_BYTES = 1024
const COMPRESSIBLE_CONTENT_TYPES = [
  'application/json',
  'application/javascript',
  'application/xml',
  'text/',
  'image/svg+xml'
]

function acceptsEncoding(req, encoding) {
  const header = String(req.headers['accept-encoding'] || '').toLowerCase()
  return header.split(',').some((entry) => entry.trim().split(';')[0] === encoding)
}

function shouldCompress(req, res, bodyLength, thresholdBytes) {
  if (req.method === 'HEAD') return false
  if (res.getHeader('Content-Encoding')) return false
  if (res.getHeader('Cache-Control') === 'no-transform') return false
  if (Number(bodyLength || 0) > 0 && Number(bodyLength) < thresholdBytes) return false

  const contentType = String(res.getHeader('Content-Type') || '').toLowerCase()
  return COMPRESSIBLE_CONTENT_TYPES.some((type) => contentType.includes(type))
}

function getPreferredEncoding(req) {
  if (acceptsEncoding(req, 'br')) return 'br'
  if (acceptsEncoding(req, 'gzip')) return 'gzip'
  if (acceptsEncoding(req, 'deflate')) return 'deflate'
  return ''
}

function createCompressionStream(encoding) {
  if (encoding === 'br' && typeof zlib.createBrotliCompress === 'function') {
    return zlib.createBrotliCompress({
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 4
      }
    })
  }
  if (encoding === 'gzip') return zlib.createGzip({ level: 6 })
  if (encoding === 'deflate') return zlib.createDeflate({ level: 6 })
  return null
}

function compressionMiddleware(options = {}) {
  const thresholdBytes = Number(options.thresholdBytes || DEFAULT_THRESHOLD_BYTES)

  return (req, res, next) => {
    const preferredEncoding = getPreferredEncoding(req)
    if (!preferredEncoding) return next()

    const originalWrite = res.write.bind(res)
    const originalEnd = res.end.bind(res)
    const chunks = []
    let hasStreamed = false

    res.write = (chunk, encoding, callback) => {
      let writeEncoding = encoding
      let writeCallback = callback

      if (typeof writeEncoding === 'function') {
        writeCallback = writeEncoding
        writeEncoding = undefined
      }

      hasStreamed = true
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, writeEncoding))
      }
      if (typeof writeCallback === 'function') writeCallback()
      return true
    }

    res.end = (chunk, encoding, callback) => {
      let endEncoding = encoding
      let endCallback = callback

      if (typeof endEncoding === 'function') {
        endCallback = endEncoding
        endEncoding = undefined
      }

      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, endEncoding))
      }

      const body = Buffer.concat(chunks)
      res.write = originalWrite
      res.end = originalEnd

      if (!hasStreamed && body.length === 0) {
        return originalEnd(chunk, endEncoding, endCallback)
      }

      if (!shouldCompress(req, res, body.length, thresholdBytes)) {
        if (body.length > 0) originalWrite(body)
        return originalEnd(undefined, undefined, endCallback)
      }

      const compressionStream = createCompressionStream(preferredEncoding)
      if (!compressionStream) {
        if (body.length > 0) originalWrite(body)
        return originalEnd(undefined, undefined, endCallback)
      }

      res.setHeader('Content-Encoding', preferredEncoding)
      res.setHeader('Vary', 'Accept-Encoding')
      res.removeHeader('Content-Length')

      pipeline(
        Readable.from(body),
        compressionStream,
        res,
        (error) => {
          if (error) {
            req.socket.destroy(error)
          }
          if (typeof endCallback === 'function') endCallback()
        }
      )
      return res
    }

    next()
  }
}

module.exports = compressionMiddleware
