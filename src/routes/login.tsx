import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (isSignUp) {
        const result = await authClient.signUp.email({
          email,
          password,
          name: name || email.split('@')[0],
        })
        if (result.error) {
          setError(result.error.message || 'Sign up failed')
          return
        }
      } else {
        const result = await authClient.signIn.email({
          email,
          password,
        })
        if (result.error) {
          setError(result.error.message || 'Sign in failed')
          return
        }
      }
      navigate({ to: '/upload' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4 text-white"
      style={{
        background:
          'linear-gradient(135deg, #0c1a2b 0%, #1a2332 50%, #16202e 100%)',
      }}
    >
      <div
        className="w-full max-w-md rounded-xl border border-white/10 p-8 shadow-2xl"
        style={{
          background:
            'linear-gradient(135deg, rgba(22, 32, 46, 0.95) 0%, rgba(12, 26, 43, 0.95) 100%)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <h1 className="mb-6 text-center text-2xl font-bold text-indigo-200">
          {isSignUp ? 'Create Account' : 'Sign In'}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="mb-1 block text-sm text-indigo-300/80">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-indigo-300/30 outline-none transition-colors focus:border-indigo-500/50"
                placeholder="Your name"
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm text-indigo-300/80">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-indigo-300/30 outline-none transition-colors focus:border-indigo-500/50"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-indigo-300/80">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-indigo-300/30 outline-none transition-colors focus:border-indigo-500/50"
              placeholder="Min 6 characters"
            />
          </div>

          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading
              ? isSignUp
                ? 'Creating account...'
                : 'Signing in...'
              : isSignUp
                ? 'Create Account'
                : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-indigo-300/60">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => {
              setIsSignUp(!isSignUp)
              setError(null)
            }}
            className="text-indigo-400 hover:text-indigo-300"
          >
            {isSignUp ? 'Sign in' : 'Create one'}
          </button>
        </div>
      </div>
    </div>
  )
}
