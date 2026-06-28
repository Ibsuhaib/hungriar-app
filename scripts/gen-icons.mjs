import sharp from 'sharp'
import toIco from 'to-ico'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const root  = resolve(__dir, '..')
const svg   = readFileSync(resolve(root, 'public/icon.svg'))

const pngs = [
  { out: 'public/favicon-16x16.png',            size: 16  },
  { out: 'public/favicon-32x32.png',            size: 32  },
  { out: 'public/pwa-64x64.png',                size: 64  },
  { out: 'public/pwa-192x192.png',              size: 192 },
  { out: 'public/pwa-512x512.png',              size: 512 },
  { out: 'public/apple-touch-icon-180x180.png', size: 180 },
  { out: 'public/maskable-icon-512x512.png',    size: 512 },
]

const pngBuffers = {}

for (const { out, size } of pngs) {
  const buf = await sharp(svg, { density: Math.ceil(size * 2.5) })
    .resize(size, size)
    .png()
    .toBuffer()
  writeFileSync(resolve(root, out), buf)
  pngBuffers[size] = buf
  console.log(`✓ ${out} (${size}×${size})`)
}

// favicon.ico — multi-size (16, 32, 48)
const ico48 = await sharp(svg, { density: 120 }).resize(48, 48).png().toBuffer()
const icoData = await toIco([pngBuffers[16], pngBuffers[32], ico48])
writeFileSync(resolve(root, 'public/favicon.ico'), icoData)
console.log('✓ public/favicon.ico (16×16 + 32×32 + 48×48)')

console.log('\nDone.')
