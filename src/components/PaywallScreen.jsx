// Shown to signed-in users without an active subscription. `checkoutUrl` is the
// Stripe payment link, tagged with the user's id so the webhook can match the payment.
export default function PaywallScreen({ email, checkoutUrl, isChecking, onRefresh, onSignOut }) {
  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <div className="py-1.5 text-center text-[10px] font-medium uppercase tracking-[0.14em]">
        <span className="underline underline-offset-2">AI Fusion</span>: upload two images, get one new look
      </div>

      <header className="px-4 pb-3 pt-2 text-center sm:px-8">
        <h1 className="text-[22px] font-medium uppercase tracking-[0.22em] sm:text-[26px]">Image Fusion</h1>
        <div className="mt-2 flex items-center justify-center gap-3 text-[10px] uppercase tracking-[0.14em]">
          <span className="max-w-[220px] truncate text-ink/70">{email}</span>
          <button type="button" onClick={onSignOut} className="underline underline-offset-2 hover:text-ink/70">
            Sign out
          </button>
        </div>
      </header>

      <div className="border-y border-ink/60 px-10 py-3 text-center text-[10px] uppercase tracking-[0.14em]">
        <span className="underline underline-offset-2">Membership</span>: subscribe to start generating
      </div>

      <main className="mx-auto max-w-[420px] px-4 pb-16 pt-8 sm:px-6">
        <nav className="flex items-center gap-2 text-[11px] text-ink/80">
          <span>Studio</span>
          <span className="text-muted">›</span>
          <span className="text-muted">Membership</span>
        </nav>

        <h2 className="mt-6 text-[34px] font-normal leading-tight">Unlock Image Fusion</h2>

        <div className="mt-6 space-y-4 border border-line p-5">
          <p className="text-[28px] font-normal leading-none">
            $9.99 <span className="text-[13px] text-ink/70">/ month</span>
          </p>
          <ul className="space-y-1.5 text-[13px] text-ink/80">
            <li>Unlimited person + clothing fusions</li>
            <li>JPG, PNG and WebP uploads up to 10 MB</li>
            <li>Cancel anytime</li>
          </ul>

          {isChecking ? (
            <div role="status" className="border border-line bg-canvas px-4 py-3 text-[13px]">
              Checking your payment…
            </div>
          ) : (
            <a
              href={checkoutUrl}
              className="flex h-[38px] w-full items-center justify-between bg-ink px-4 text-[10px] font-medium uppercase tracking-[0.14em] text-white transition-colors hover:bg-black"
            >
              Subscribe
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M5 12h14m-5-5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          )}

          <p className="text-[11px] text-muted">
            Secure checkout by Stripe. Already paid?{' '}
            <button
              type="button"
              onClick={onRefresh}
              disabled={isChecking}
              className="underline underline-offset-2 hover:text-ink disabled:opacity-50"
            >
              Refresh status
            </button>
          </p>
        </div>
      </main>
    </div>
  )
}
