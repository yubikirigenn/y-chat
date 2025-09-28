// (Auth.tsxのコードをここに貼り付け)
import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Auth() {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLogin, setIsLogin] = useState(true)

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      let error = null
      if (isLogin) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        error = signInError
      } else {
        const { error: signUpError } = await supabase.auth.signUp({ email, password })
        error = signUpError
      }
      if (error) throw error
      if (!isLogin) alert('確認メールを送信しました。メール内のリンクをクリックして登録を完了してください。')
    } catch (error: any) {
      alert(error.error_description || error.message)
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
            <label htmlFor="email" className="block text-sm font-medium text-gray-300">メールアドレス</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-3 py-2 mt-1 text-white bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300">パスワード</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full px-3 py-2 mt-1 text-white bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <button type="submit" disabled={loading} className="w-full px-4 py-2 font-semibold text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-500">{loading ? '処理中...' : (isLogin ? 'ログイン' : '新規登録')}</button>
        </form>
        <div className="text-center">
          <button onClick={() => setIsLogin(!isLogin)} className="text-sm text-green-400 hover:underline">{isLogin ? 'アカウントをお持ちでないですか？ 新規登録' : '既にアカウントをお持ちですか？ ログイン'}</button>
        </div>
      </div>
    </div>
  )
}