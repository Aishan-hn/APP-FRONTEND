import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

const MIN_PASSWORD_LENGTH = 8

function Field({ label, ...props }) {
  return (
    <label className="block">
      <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink/80">{label}</span>
      <input
        {...props}
        required
        className="mt-1.5 h-[40px] w-full border border-line bg-white px-3 text-[14px] text-ink outline-none focus:border-ink disabled:opacity-50"
      />
    </label>
  )
}

export default function AuthScreen() {
  const [mode, setMode] = useState('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)
  const [notice, setNotice] = useState(null)

  const isSignUp = mode === 'signup'

  const switchMode = (next) => {
    setMode(next)
    setErrorMessage(null)
    setNotice(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    setErrorMessage(null)
    setNotice(null)

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: window.location.origin },
        })
        if (error) throw error
        // With email confirmation on, no session is returned until the link is clicked
        if (!data.session) {
          setNotice(`We sent a confirmation link to ${email}. Open it to activate your account, then sign in.`)
          setPassword('')
          setMode('signin')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      setErrorMessage(err.message || 'Something went wrong.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <div className="py-1.5 text-center text-[10px] font-medium uppercase tracking-[0.14em]">
        <span className="underline underline-offset-2">AI Fusion</span>: upload two images, get one new look
      </div>

      <header className="px-4 pb-3 pt-2 text-center sm:px-8">
        <h1 className="text-[22px] font-medium uppercase tracking-[0.22em] sm:text-[26px]">Image Fusion</h1>
      </header>

      <div className="border-y border-ink/60 px-10 py-3 text-center text-[10px] uppercase tracking-[0.14em]">
        <span className="underline underline-offset-2">Members only</span>: sign in or create an account to continue
      </div>

      <main className="mx-auto max-w-[420px] px-4 pb-16 pt-8 sm:px-6">
        <nav className="flex items-center gap-2 text-[11px] text-ink/80">
          <span>Studio</span>
          <span className="text-muted">›</span>
          <span className="text-muted">{isSignUp ? 'Create Account' : 'Sign In'}</span>
        </nav>

        <h2 className="mt-6 text-[34px] font-normal leading-tight">{isSignUp ? 'Create Account' : 'Sign In'}</h2>

        <div className="mt-6 flex gap-2.5">
          {[
            ['signin', 'Sign in'],
            ['signup', 'Create account'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => switchMode(value)}
              className={`rounded-full border px-3 py-[5px] text-[12px] leading-none ${
                mode === value ? 'border-ink bg-ink text-white' : 'border-ink/70 text-ink hover:bg-canvas'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {notice && (
          <div role="status" className="mt-6 border border-line bg-canvas px-4 py-3 text-[13px]">
            {notice}
          </div>
        )}
        {errorMessage && (
          <div role="alert" className="mt-6 border border-red-700/60 bg-red-50 px-4 py-3 text-[13px] text-red-800">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 border border-line p-5">
          {isSignUp && (
            <Field
              label="Name"
              type="text"
              autoComplete="name"
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
            />
          )}
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSubmitting}
          />
          <Field
            label="Password"
            type="password"
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            minLength={isSignUp ? MIN_PASSWORD_LENGTH : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isSubmitting}
          />
          {isSignUp && <p className="text-[11px] text-muted">At least {MIN_PASSWORD_LENGTH} characters.</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex h-[38px] w-full items-center justify-between bg-ink px-4 text-[10px] font-medium uppercase tracking-[0.14em] text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-[#b5b5b5]"
          >
            {isSubmitting ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M5 12h14m-5-5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      </main>
    </div>
  )
}
