import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const publicDir = path.join(projectRoot, 'public')
const outputDir = path.join(publicDir, 'videos')

const videoFiles = [
  'landingpagevideo.mp4',
  '2024introvid.mp4',
  '2024SHSintrovid.mp4'
]

mkdirSync(outputDir, { recursive: true })

const ffmpegBin = process.env.FFMPEG_PATH || 'ffmpeg'
const canUseFfmpeg =
  spawnSync(ffmpegBin, ['-version'], {
    stdio: 'ignore',
    shell: process.platform === 'win32'
  }).status === 0

if (!canUseFfmpeg) {
  console.warn('[video-opt] ffmpeg not found. Skipping compression.')
  console.warn('[video-opt] Install ffmpeg or set FFMPEG_PATH to enable optimized production videos.')
  process.exit(0)
}

for (const fileName of videoFiles) {
  const inputPath = path.join(publicDir, fileName)
  const outputPath = path.join(outputDir, fileName)

  if (!existsSync(inputPath)) {
    console.warn(`[video-opt] Source video not found: ${inputPath}`)
    continue
  }

  if (existsSync(outputPath)) {
    const sourceStat = statSync(inputPath)
    const outputStat = statSync(outputPath)
    if (outputStat.mtimeMs >= sourceStat.mtimeMs) {
      console.log(`[video-opt] Up-to-date: ${fileName}`)
      continue
    }
  }

  console.log(`[video-opt] Compressing ${fileName} -> public/videos/${fileName}`)

  const ffmpegArgs = [
    '-y',
    '-i',
    inputPath,
    '-vf',
    'scale=-2:720',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '27',
    '-movflags',
    '+faststart',
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    outputPath
  ]

  const result = spawnSync(ffmpegBin, ffmpegArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })

  if (result.status !== 0) {
    console.warn(`[video-opt] Compression failed for ${fileName}. Keeping raw file fallback.`)
    continue
  }

  const sourceBytes = statSync(inputPath).size
  const outputBytes = statSync(outputPath).size
  const reduction = sourceBytes > 0 ? ((1 - outputBytes / sourceBytes) * 100).toFixed(1) : '0.0'
  console.log(`[video-opt] Done: ${fileName} (${sourceBytes} -> ${outputBytes}, ${reduction}% smaller)`)
}

