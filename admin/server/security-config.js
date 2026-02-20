/**
 * Security Configuration for West Coast College Admin System
 * 
 * This file contains security headers and configurations to protect
 * the application from common web vulnerabilities.
 */

const securityConfig = {
  // HSTS (HTTP Strict Transport Security)
  // Forces browsers to use HTTPS only
  hsts: {
    header: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains; preload',
    description: 'Enforces HTTPS-only connections for 1 year, includes subdomains, and requests browser preloading'
  },

  // Content Type Protection
  // Prevents MIME type sniffing
  contentTypeOptions: {
    header: 'X-Content-Type-Options',
    value: 'nosniff',
    description: 'Prevents browsers from MIME-sniffing a response away from the declared content-type'
  },

  // Clickjacking Protection
  // Prevents the site from being embedded in iframes
  frameOptions: {
    header: 'X-Frame-Options',
    value: 'DENY',
    description: 'Prevents clickjacking attacks by denying iframe embedding'
  },

  // XSS Protection
  // Enables browser XSS filtering
  xssProtection: {
    header: 'X-XSS-Protection',
    value: '1; mode=block',
    description: 'Enables XSS filtering in browsers and blocks detected attacks'
  },

  // Referrer Policy
  // Controls how much referrer information is sent
  referrerPolicy: {
    header: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
    description: 'Sends full referrer for same-origin requests and only origin for cross-origin requests'
  },

  // Content Security Policy
  // Defines approved content sources
  contentSecurityPolicy: {
    header: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://www.google.com https://www.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https://www.google.com https://www.gstatic.com; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' ws: wss: https://www.google.com https://www.gstatic.com http://localhost:3001; frame-src 'self' https://www.google.com https://recaptcha.google.com; frame-ancestors 'none';",
    description: 'Defines which content sources are allowed to be loaded',
    breakdown: {
      'default-src': "'self' - Only allow resources from same origin",
      'script-src': "'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://www.google.com https://www.gstatic.com - Allow same-origin scripts and approved CDN scripts for animation libraries and reCAPTCHA",
      'style-src': "'self' 'unsafe-inline' - Allow same-origin styles with inline for CSS-in-JS",
      'img-src': "'self' data: blob: https://www.google.com https://www.gstatic.com - Allow images from same origin, data URLs, and reCAPTCHA assets",
      'font-src': "'self' data: - Allow fonts from same origin and data URLs",
      'connect-src': "'self' ws: wss: https://www.google.com https://www.gstatic.com - Allow API calls, WebSocket connections, and reCAPTCHA API calls",
      'frame-src': "'self' https://www.google.com https://recaptcha.google.com - Allow embedded reCAPTCHA frames",
      'frame-ancestors': "'none' - Prevent site from being embedded in any frame"
    }
  },

  // Permissions Policy
  // Controls browser feature access
  permissionsPolicy: {
    header: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()',
    description: 'Controls access to browser features like camera, microphone, and geolocation'
  },

  // Server Header
  // Controls server information disclosure
  serverHeader: {
    header: 'Server',
    value: 'WCC-Admin',
    description: 'Generic server identifier to hide technology stack'
  }
}

/**
 * Middleware function to apply all security headers
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function applySecurityHeaders(req, res, next) {
  // Apply HSTS
  res.setHeader(securityConfig.hsts.header, securityConfig.hsts.value)
  
  // Apply Content Type Protection
  res.setHeader(securityConfig.contentTypeOptions.header, securityConfig.contentTypeOptions.value)
  
  // Apply Clickjacking Protection
  res.setHeader(securityConfig.frameOptions.header, securityConfig.frameOptions.value)
  
  // Apply XSS Protection
  res.setHeader(securityConfig.xssProtection.header, securityConfig.xssProtection.value)
  
  // Apply Referrer Policy
  res.setHeader(securityConfig.referrerPolicy.header, securityConfig.referrerPolicy.value)
  
  // Apply Content Security Policy
  res.setHeader(securityConfig.contentSecurityPolicy.header, securityConfig.contentSecurityPolicy.value)
  
  // Apply Permissions Policy
  res.setHeader(securityConfig.permissionsPolicy.header, securityConfig.permissionsPolicy.value)
  
  next()
}

module.exports = {
  securityConfig,
  applySecurityHeaders
}
