type PreprocessPreset = 'source' | 'general' | 'binary' | 'digits'

type CropRegion = {
  left: number
  top: number
  width: number
  height: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not load the selected image.'))
    }

    image.src = objectUrl
  })
}

function requireContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) {
    throw new Error('Canvas is not available in this browser.')
  }

  return context
}

export async function buildSourceCanvas(file: File) {
  const image = await loadImage(file)
  const longestEdge = Math.max(image.width, image.height)
  const targetEdge = 2200
  const scale = clamp(targetEdge / longestEdge, 1, 2.4)
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = requireContext(canvas)
  context.drawImage(image, 0, 0, width, height)

  return canvas
}

export function createProcessedCanvas(
  sourceCanvas: HTMLCanvasElement,
  preset: PreprocessPreset,
) {
  const canvas = document.createElement('canvas')
  canvas.width = sourceCanvas.width
  canvas.height = sourceCanvas.height

  const context = requireContext(canvas)

  if (preset === 'source') {
    context.drawImage(sourceCanvas, 0, 0)
    return canvas
  }

  context.filter =
    preset === 'general'
      ? 'grayscale(1) contrast(1.18) brightness(1.02)'
      : 'grayscale(1) contrast(1.45) brightness(1.08)'
  context.drawImage(sourceCanvas, 0, 0)

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = imageData

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index]
    const green = data[index + 1]
    const blue = data[index + 2]

    const gray = red * 0.299 + green * 0.587 + blue * 0.114
    const stretched =
      preset === 'general'
        ? clamp((gray - 128) * 1.16 + 128, 0, 255)
        : clamp((gray - 128) * 1.52 + 128, 0, 255)

    const cleaned =
      preset === 'general'
        ? Math.round(stretched)
        : stretched > 178
          ? 255
          : stretched < 104
            ? 0
            : Math.round(stretched)

    data[index] = cleaned
    data[index + 1] = cleaned
    data[index + 2] = cleaned
  }

  context.putImageData(imageData, 0, 0)

  return canvas
}

export function createCropCanvas(
  sourceCanvas: HTMLCanvasElement,
  region: CropRegion,
  preset: PreprocessPreset,
  upscale = 2,
) {
  const left = Math.round(sourceCanvas.width * region.left)
  const top = Math.round(sourceCanvas.height * region.top)
  const width = Math.max(1, Math.round(sourceCanvas.width * region.width))
  const height = Math.max(1, Math.round(sourceCanvas.height * region.height))

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * upscale))
  canvas.height = Math.max(1, Math.round(height * upscale))

  const context = requireContext(canvas)
  context.drawImage(sourceCanvas, left, top, width, height, 0, 0, canvas.width, canvas.height)

  return createProcessedCanvas(canvas, preset)
}
