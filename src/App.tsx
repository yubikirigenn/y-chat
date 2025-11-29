import { useState, useEffect } from 'react'
import { supabase } from './lib/supabaseClient'
import Auth from './pages/Auth'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './pages/MainLayout'
import Chat from './pages/Chat'
import Profile from './pages/Profile'
import AdminRoute from './pages/AdminRoute'
import Studio from './pages/Studio'

function App() {
  const [session, setSession] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setSession(session)
      setLoading(false)
    }
    getSession()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) { 
    return (
      <div className="flex items-center justify-center h-screen bg-gray-800 text-white">
        読み込み中...
      </div>
    ) 
  }

  return (
    <Router>
      <Routes>
        <Route path="/auth" element={!session ? <Auth /> : <Navigate to="/" />} />
        
        {/* 🎛️ Studio（管理画面） */}
        <Route 
          path="/studio" 
          element={
            session ? (
              <AdminRoute session={session}>
                <Studio session={session} />
              </AdminRoute>
            ) : (
              <Navigate to="/auth" />
            )
          } 
        />
        
        {/* メインアプリ */}
        <Route path="/" element={session ? <MainLayout session={session} /> : <Navigate to="/auth" />}>
          <Route path="chat/:roomId" element={<Chat session={session} />} />
          <Route path="profile" element={<Profile session={session} />} />
          <Route index element={<SelectRoomPlaceholder />} />
        </Route>
      </Routes>
    </Router>
  )
}

function SelectRoomPlaceholder() {
  return (
    <div className="flex flex-col h-screen justify-center items-center bg-[#798696] text-white">
      <h2 className="text-xl">トークルームを選択してください</h2>
    </div>
  )
}

export default App