import { useEffect, useRef, useState } from 'react'
import UploadCard from './components/UploadCard.jsx'
import ResultCard from './components/ResultCard.jsx'

// Same-origin proxy (server/fuse-handler.js); the real webhook URL stays server-side
const API_URL = '/api/fuse'
const REQUEST_TIMEOUT_MS = 130_000
const MAX_FILE_BYTES = 10 * 1024 * 1024

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']

function isAllowedFile(file) {
  const name = file.name.toLowerCase()
  return ALLOWED_TYPES.includes(file.type) && ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext))
}

function Chip({ active, children }) {
  return (
    <span
      className={`rounded-full border px-3 py-[5px] text-[12px] leading-none ${
        active ? 'border-ink bg-ink text-white' : 'border-ink/70 text-ink'
      }`}
    >
      {children}
    </span>
  )
}

export default function App() {
  const [image1, setImage1] = useState(null)
  const [image2, setImage2] = useState(null)
  const [preview1, setPreview1] = useState(null)
  const [preview2, setPreview2] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [resultImage, setResultImage] = useState(null)
  const [errorMessage, setErrorMessage] = useState(null)
  const [showNotice, setShowNotice] = useState(true)

  // Track live object URLs so they can be revoked on unmount
  const urlsRef = useRef({ preview1, preview2, resultImage })
  urlsRef.current = { preview1, preview2, resultImage }
  useEffect(
    () => () => Object.values(urlsRef.current).forEach((url) => url && URL.revokeObjectURL(url)),
    [],
  )

  const handleFile = (slot, file) => {
    if (!isAllowedFile(file)) {
      setErrorMessage(`"${file.name}" is not supported. Please upload a .jpg, .jpeg, .png or .webp image.`)
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setErrorMessage(`"${file.name}" is too large. Each image must be 10 MB or less.`)
      return
    }
    const url = URL.createObjectURL(file)
    if (slot === 1) {
      if (preview1) URL.revokeObjectURL(preview1)
      setImage1(file)
      setPreview1(url)
    } else {
      if (preview2) URL.revokeObjectURL(preview2)
      setImage2(file)
      setPreview2(url)
    }
    setErrorMessage(null)
  }

  const handleRemove = (slot) => {
    if (slot === 1) {
      if (preview1) URL.revokeObjectURL(preview1)
      setImage1(null)
      setPreview1(null)
    } else {
      if (preview2) URL.revokeObjectURL(preview2)
      setImage2(null)
      setPreview2(null)
    }
  }

  const handleReset = () => {
    handleRemove(1)
    handleRemove(2)
    if (resultImage) URL.revokeObjectURL(resultImage)
    setResultImage(null)
    setErrorMessage(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!image1 || !image2) return

    setIsLoading(true)
    setErrorMessage(null)

    try {
      const formData = new FormData()
      formData.append('image1', image1)
      formData.append('image2', image2)

      // No Content-Type header: the browser sets multipart/form-data with the boundary
      const response = await fetch(API_URL, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error || `Request failed (${response.status}).`)
      }

      const blob = await response.blob()
      if (!blob.type.startsWith('image/')) throw new Error('The server did not return an image.')
      if (resultImage) URL.revokeObjectURL(resultImage)
      setResultImage(URL.createObjectURL(blob))
    } catch (err) {
      const message =
        err.name === 'TimeoutError'
          ? 'The request took too long. Please try again.'
          : err instanceof TypeError
            ? 'Could not reach the server. Check your connection and try again.'
            : err.message || 'Something went wrong.'
      setErrorMessage(message)
    } finally {
      setIsLoading(false)
    }
  }

  const uploadedCount = (image1 ? 1 : 0) + (image2 ? 1 : 0)
  const canSubmit = Boolean(image1 && image2) && !isLoading

  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      {/* Top bar */}
      <div className="py-1.5 text-center text-[10px] font-medium uppercase tracking-[0.14em]">
        <span className="underline underline-offset-2">AI Fusion</span>: upload two images, get one new look
      </div>

      {/* Header */}
      <header className="relative px-4 pb-3 pt-2 sm:px-8">
        <div className="flex items-center justify-between">
          <span className="hidden text-[10px] uppercase tracking-[0.14em] text-ink sm:block">Person + Clothing</span>
          <h1 className="mx-auto text-[22px] font-medium uppercase tracking-[0.22em] sm:mx-0 sm:text-[26px]">
            Image Fusion
          </h1>
          <span className="hidden text-[10px] uppercase tracking-[0.14em] sm:block">JPG | PNG | WEBP</span>
        </div>
      </header>

      {/* Notice band */}
      {showNotice && (
        <div className="relative border-y border-ink/60 px-10 py-3 text-center text-[10px] uppercase tracking-[0.14em]">
          <span className="underline underline-offset-2">Accepted formats</span>: .jpg, .jpeg, .png and .webp
          <button
            type="button"
            aria-label="Dismiss notice"
            onClick={() => setShowNotice(false)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-ink/70 hover:text-ink"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      <main className="mx-auto max-w-[880px] px-4 pb-16 pt-8 sm:px-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-[11px] text-ink/80">
          <span>Studio</span>
          <span className="text-muted">›</span>
          <span>Fusion</span>
          <span className="text-muted">›</span>
          <span className="text-muted">New Look</span>
        </nav>

        <h2 className="mt-6 text-[34px] font-normal leading-tight">Image Fusion</h2>

        {/* Status chips */}
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Chip active={!!image1}>Person {image1 ? '✓' : ''}</Chip>
          <Chip active={!!image2}>Clothing {image2 ? '✓' : ''}</Chip>
          <Chip active={!!resultImage}>Result {resultImage ? '✓' : ''}</Chip>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Action bar */}
          <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
            <div className="flex">
              <button
                type="submit"
                disabled={!canSubmit}
                className="flex h-[38px] w-[150px] items-center justify-between bg-ink px-4 text-[10px] font-medium uppercase tracking-[0.14em] text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-[#b5b5b5]"
              >
                {isLoading ? 'Fusing…' : 'Fuse Images'}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M5 12h14m-5-5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={isLoading}
                className="flex h-[38px] w-[138px] items-center justify-between border border-ink/70 px-3 text-[10px] font-medium uppercase tracking-[0.14em] hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reset
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <span className="text-[12px] text-ink/70">{uploadedCount} of 2 images</span>
          </div>

          {/* Error state */}
          {errorMessage && (
            <div role="alert" className="mt-4 border border-red-700/60 bg-red-50 px-4 py-3 text-[13px] text-red-800">
              {errorMessage}
            </div>
          )}

          {/* Grid */}
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <UploadCard
              label="Image 1 · Person"
              hint="Base image"
              file={image1}
              preview={preview1}
              onSelect={(f) => handleFile(1, f)}
              onRemove={() => handleRemove(1)}
              disabled={isLoading}
            />
            <UploadCard
              label="Image 2 · Clothing"
              hint="Garment image"
              file={image2}
              preview={preview2}
              onSelect={(f) => handleFile(2, f)}
              onRemove={() => handleRemove(2)}
              disabled={isLoading}
            />
            <ResultCard resultImage={resultImage} isLoading={isLoading} />
          </div>
        </form>
      </main>
    </div>
  )
}
