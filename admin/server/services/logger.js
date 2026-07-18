const rawEnv = String(process.env.NODE_ENV || 'development').toLowerCase()
const isDevelopment = rawEnv === 'development' || rawEnv === 'dev' || rawEnv === 'test'

const logger = {
  debug: (...args) => {
    if (isDevelopment) console.debug(...args)
  },
  info: (...args) => {
    if (isDevelopment) console.info(...args)
  },
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
  critical: (...args) => console.error(...args)
}

function installConsoleGuards() {
  if (isDevelopment) return

  console.log = () => {}
  console.debug = () => {}
  console.info = () => {}
}

module.exports = {
  isDevelopment,
  logger,
  installConsoleGuards
}
