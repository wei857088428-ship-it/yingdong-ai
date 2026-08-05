'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    // 下一步在这里接入 Supabase、Clerk 或其他注册服务
    console.log({ email, password })
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-2xl border p-6"
      >
        <h1 className="text-2xl font-semibold">影动AI 注册</h1>

        <div>
          <label className="mb-2 block text-sm">邮箱</label>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm">密码</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border px-3 py-2"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-lg bg-black px-4 py-2 text-white"
        >
          注册
        </button>

        <p className="text-center text-sm">
          已有账号？{' '}
          <Link href="/login" className="underline">
            登录
          </Link>
        </p>
      </form>
    </main>
  )
}