import sharp from 'sharp'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const root  = resolve(__dir, '..')
const svg   = readFileSync(resolve(root, 'public/icon.svg'))

const icons = [
  { out: 'public/favicon-32x32.png',            size: 32  },
  { out: 'public/pwa-64x64.png',                size: 64  },
  { out: 'public/pwa-192x192.png',              size: 192 },
  { out: 'public/pwa-512x512.png',              size: 512 },
  { out: 'public/apple-touch-icon-180x180.png', size: 180 },
  { out: 'public/maskable-icon-512x512.png',    size: 512 },
]

for (const { out, size } of icons) {
  await sharp(svg, { density: Math.ceil(size * 2.5) })
    .resize(size, size)
    .png()
    .toFile(resolve(root, out))
  console.log(`✓ ${out} (${size}×${size})`)
}

console.log('Done.')
