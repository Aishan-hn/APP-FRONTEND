import { useRef, useState } from 'react'

export default function UploadCard({ label, hint, file, preview, onSelect, onRemove, disabled }) {
  const inputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)

  const openPicker = () => {
    if (!disabled) inputRef.current?.click()
  }

  const handleChange = (e) => {
    const selected = e.target.files?.[0]
    if (selected) onSelect(selected)
    // Allow re-selecting the same file after removal
    e.target.value = ''
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    if (disabled) return
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) onSelect(dropped)
  }

  return (
    <div className="flex flex-col border border-line bg-white">
      <div
        role="button"
        tabIndex={0}
        onClick={openPicker}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openPicker()}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative aspect-[3/4] cursor-pointer overflow-hidden bg-canvas transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ink ${
          isDragging ? 'bg-[#e9e9e6]' : ''
        } ${disabled ? 'cursor-not-allowed' : ''}`}
      >
        {preview ? (
          <img src={preview} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-muted">
              <path d="M12 16V4m0 0-4 4m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" strokeLinecap="round" />
            </svg>
            <span className="text-[11px] uppercase tracking-[0.14em] text-ink">Click or drop image</span>
            <span className="text-[10px] uppercase tracking-[0.12em] text-muted">JPG · PNG · WEBP</span>
          </div>
        )}

        {file && !disabled && (
          <button
            type="button"
            aria-label={`Remove ${label}`}
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-ink hover:bg-white"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          onChange={handleChange}
          className="hidden"
        />
      </div>

      <div className="px-3 py-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em]">{label}</p>
        <p className="mt-1 truncate text-[12px] text-muted">{file ? file.name : hint}</p>
      </div>
    </div>
  )
}
