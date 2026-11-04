export default function ResultCard({ resultImage, isLoading }) {
  return (
    <div className="flex flex-col border border-line bg-white sm:col-span-2">
      <div className="relative aspect-[3/4] overflow-hidden bg-canvas sm:aspect-auto sm:h-full sm:min-h-[320px]">
        {resultImage && (
          <img src={resultImage} alt="Generated result" className="absolute inset-0 h-full w-full object-contain" />
        )}

        {!resultImage && !isLoading && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-muted">
              <rect x="3" y="4" width="18" height="16" rx="1" />
              <circle cx="9" cy="10" r="1.6" />
              <path d="m4 18 5-5 4 4 3-3 4 4" strokeLinejoin="round" />
            </svg>
            <span className="text-[11px] uppercase tracking-[0.14em] text-muted">Your result will appear here</span>
          </div>
        )}

        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white/70">
            <span className="h-8 w-8 animate-spin rounded-full border border-line border-t-ink" />
            <span className="text-[11px] uppercase tracking-[0.18em]">Generating…</span>
          </div>
        )}

        {resultImage && !isLoading && (
          <a
            href={resultImage}
            download="fusion-result"
            aria-label="Download result"
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-ink hover:bg-white"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 4v12m0 0-4-4m4 4 4-4M5 20h14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        )}
      </div>

      <div className="px-3 py-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em]">Result</p>
        <p className="mt-1 text-[12px] text-muted">
          {resultImage ? 'Generated image' : isLoading ? 'Processing your images' : 'Awaiting fusion'}
        </p>
      </div>
    </div>
  )
}
