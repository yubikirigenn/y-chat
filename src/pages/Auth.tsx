import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Auth() {
  const [loading, setLoading] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLogin, setIsLogin] = useState(true)

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    // ★★★★★ ここが修正点 ★★★★★
    const email = `${username}@gmail.com` // ダブルクォートをバッククォートに変更

    try {
      let error = null;
      if (isLogin) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        error = signInError
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username: username } }
        })
        error = signUpError
      }
      if (error) throw error
    } catch (error: any) {
      if (error.message.includes("User already registered")) {
        alert("そのユーザー名は既に使用されています。")
      } else {
        alert(error.error_description || error.message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="w-full max-w-sm p-8 space-y-6 bg-gray-800 rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-center text-white">
          {isLogin ? 'Y-Chatへようこそ' : 'アカウントを作成'}
        </h1>
        <form onSubmit={handleAuth} className="space-y-6">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-300">ユーザーネーム</label>
            <input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} required className="w-full px-3 py-2 mt-1 text-white bg-gray-700 border border-gray-600 rounded-md"/>
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300">パスワード</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full px-3 py-2 mt-1 text-white bg-gray-700 border border-gray-600 rounded-md"/>
          </div>
          <button type="submit" disabled={loading} className="w-full px-4 py-2 font-semibold text-white bg-green-600 rounded-md">
            {loading ? '処理中...' : (isLogin ? 'ログイン' : '新規登録')}
          </button>
        </form>
        <div className="text-center">
          <button onClick={() => setIsLogin(!isLogin)} className="text-sm text-green-400 hover:underline">
            {isLogin ? 'アカウントをお持ちでないですか？' : '既にアカウントをお持ちですか？'}
          </button>
        </div>
      </div>
    </div>
  )
}