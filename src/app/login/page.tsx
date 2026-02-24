'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Loader2, LogIn, UserPlus, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    if (mode === 'signin') {
      const { error: err } = await signIn(email, password);
      if (err) setError(err);
    } else if (mode === 'signup') {
      if (!fullName.trim()) { setError('Please enter your full name'); setLoading(false); return; }
      if (password.length < 6) { setError('Password must be at least 6 characters'); setLoading(false); return; }
      const { error: err } = await signUp(email, password, fullName);
      if (err) setError(err);
      else setSuccess('Account created! You can now sign in.');
    } else if (mode === 'reset') {
      const { error: err } = await resetPassword(email);
      if (err) setError(err);
      else setSuccess('Password reset email sent. Check your inbox.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-prospex-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-prospex-cyan to-prospex-cyan/50 mb-4">
            <span className="text-2xl font-bold text-white font-mono">P</span>
          </div>
          <h1 className="text-2xl font-bold text-white font-mono">Prospex</h1>
          <p className="text-sm text-prospex-muted mt-1">Lead Intelligence Platform</p>
        </div>

        {/* Card */}
        <div className="bg-prospex-surface border border-prospex-border rounded-xl p-6">
          {/* Tabs */}
          {mode !== 'reset' && (
            <div className="flex mb-6 bg-prospex-bg rounded-lg p-1">
              <button
                onClick={() => { setMode('signin'); setError(null); setSuccess(null); }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${mode === 'signin' ? 'bg-prospex-cyan text-white' : 'text-prospex-muted hover:text-white'}`}
              >
                Sign In
              </button>
              <button
                onClick={() => { setMode('signup'); setError(null); setSuccess(null); }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${mode === 'signup' ? 'bg-prospex-cyan text-white' : 'text-prospex-muted hover:text-white'}`}
              >
                Sign Up
              </button>
            </div>
          )}

          {mode === 'reset' && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-white">Reset Password</h2>
              <p className="text-xs text-prospex-muted mt-1">Enter your email and we&apos;ll send you a reset link.</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-mono text-prospex-dim uppercase mb-1.5">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-prospex-dim" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="John Smith"
                    className="w-full pl-10 pr-4 py-2.5 bg-prospex-bg border border-prospex-border rounded-lg text-sm text-white placeholder:text-prospex-dim focus:outline-none focus:border-prospex-cyan"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-mono text-prospex-dim uppercase mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-prospex-dim" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-prospex-bg border border-prospex-border rounded-lg text-sm text-white placeholder:text-prospex-dim focus:outline-none focus:border-prospex-cyan"
                />
              </div>
            </div>

            {mode !== 'reset' && (
              <div>
                <label className="block text-xs font-mono text-prospex-dim uppercase mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-prospex-dim" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="w-full pl-10 pr-10 py-2.5 bg-prospex-bg border border-prospex-border rounded-lg text-sm text-white placeholder:text-prospex-dim focus:outline-none focus:border-prospex-cyan"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-prospex-dim hover:text-white">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            {success && (
              <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                <p className="text-xs text-green-400">{success}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-prospex-cyan text-white font-semibold text-sm rounded-lg hover:bg-prospex-cyan/80 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : mode === 'signin' ? (
                <><LogIn className="w-4 h-4" /> Sign In</>
              ) : mode === 'signup' ? (
                <><UserPlus className="w-4 h-4" /> Create Account</>
              ) : (
                <><Mail className="w-4 h-4" /> Send Reset Link</>
              )}
            </button>
          </form>

          {/* Bottom links */}
          <div className="mt-4 text-center">
            {mode === 'signin' && (
              <button onClick={() => { setMode('reset'); setError(null); setSuccess(null); }} className="text-xs text-prospex-muted hover:text-prospex-cyan transition-colors">
                Forgot password?
              </button>
            )}
            {mode === 'reset' && (
              <button onClick={() => { setMode('signin'); setError(null); setSuccess(null); }} className="text-xs text-prospex-muted hover:text-prospex-cyan transition-colors">
                ← Back to sign in
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-[10px] text-prospex-dim mt-6">
          Prospex Lead Intelligence Platform — Internal Use Only
        </p>
      </div>
    </div>
  );
}
