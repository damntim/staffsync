import * as faceapi from 'face-api.js'

const MODEL_URL = '/models'

let loaded = false
let loading = false
let loadPromise = null

export async function loadModels() {
  if (loaded) return
  if (loading) return loadPromise

  loading = true
  loadPromise = Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]).then(() => {
    loaded = true
    loading = false
  })

  return loadPromise
}

/**
 * Extracts a 128D face descriptor from a <video> element.
 * Returns Float32Array(128) or null if no face detected.
 */
export async function extractDescriptor(videoEl) {
  await loadModels()

  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })

  const detection = await faceapi
    .detectSingleFace(videoEl, options)
    .withFaceLandmarks()
    .withFaceDescriptor()

  if (!detection) return null

  return detection.descriptor   // Float32Array(128)
}

/**
 * Averages an array of Float32Array(128) descriptors into one.
 */
export function averageDescriptors(descriptors) {
  if (!descriptors.length) return null
  const len = descriptors[0].length
  const avg = new Float32Array(len)
  for (const d of descriptors) {
    for (let i = 0; i < len; i++) avg[i] += d[i]
  }
  for (let i = 0; i < len; i++) avg[i] /= descriptors.length
  return avg
}

/**
 * Converts Float32Array descriptor to a plain number[] for JSON.
 */
export function descriptorToArray(descriptor) {
  return Array.from(descriptor)
}
