import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const distDir = path.join(projectRoot, 'dist')
const distOptimizedDir = path.join(distDir, 'videos')

const rawVideoFiles = [
  'landingpagevideo.mp4',
  '2024introvid.mp4',
  '2024SHSintrovid.mp4'
]

if (!existsSync(distDir)) {
  console.log('[video-opt] dist directory not found, skipping prune step.')
  process.exit(0)
}

for (const fileName of rawVideoFiles) {
  const rawDistPath = path.join(distDir, fileName)
  const optimizedDistPath = path.join(distOptimizedDir, fileName)

  if (!existsSync(rawDistPath)) {
    continue
  }

  if (existsSync(optimizedDistPath)) {
    rmSync(rawDistPath, { force: true })
    console.log(`[video-opt] Removed raw dist file: ${fileName}`)
  } else {
    console.log(`[video-opt] Keeping raw dist file (no optimized output): ${fileName}`)
  }
}

