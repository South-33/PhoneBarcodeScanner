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

export async function buildOcrCanvas(file: File) {
  const image = await loadImage(file)
  const longestEdge = Math.max(image.width, image.height)
  const targetEdge = 1800
  const scale = clamp(targetEdge / longestEdge, 1, 2)
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) {
    throw new Error('Canvas is not available in this browser.')
  }

  context.filter = 'grayscale(1) contrast(1.4) brightness(1.05)'
  context.drawImage(image, 0, 0, width, height)

  const imageData = context.getImageData(0, 0, width, height)
  const { data } = imageData

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index]
    const green = data[index + 1]
    const blue = data[index + 2]

    const gray = red * 0.299 + green * 0.587 + blue * 0.114
    const boosted = clamp((gray - 128) * 1.35 + 128, 0, 255)
    const cleaned =
      boosted > 188 ? 255 : boosted < 82 ? 0 : Math.round(boosted)

    data[index] = cleaned
    data[index + 1] = cleaned
    data[index + 2] = cleaned
  }

  context.putImageData(imageData, 0, 0)

  return canvas
}
