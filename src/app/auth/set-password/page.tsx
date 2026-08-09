'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function SetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-medium text-center mb-1">Welcome to Vitality</h1>
        <p className="text-sm text-center text-neutral-500 mb-8">Set a password to finish creating your account</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            required
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
          <input
            type="password"
            required
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-lg bg-brand text-white py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Set password & continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
