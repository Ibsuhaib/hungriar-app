import { defineConfig, minimalPreset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  preset: {
    ...minimalPreset,
    maskable: {
      sizes: [512],
      padding: 0.1,  // small padding so logo isn't clipped on rounded Android icons
    },
  },
  // Replace icon-source.png with your actual logo file
  images: ['public/icon-source.png'],
})
