import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import RoomList from './RoomList';

interface MainLayoutProps {
  session: any;
}

export default function MainLayout({ session }: MainLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isChatOrProfileRoute = location.pathname.startsWith('/chat/') || location.pathname.startsWith('/profile');

  return (
    <div className="flex h-screen font-sans">
      {/* 左側サイドバー: トークルーム一覧 (PCでは常に表示、スマホではチャット未選択時のみ表示) */}
      <div className={`w-full md:w-80 md:flex-shrink-0 bg-black ${isChatOrProfileRoute ? 'hidden md:block' : 'block'}`}>
        <RoomList session={session} />
      </div>

      {/* 右側メインコンテンツ: チャット画面 (PCでは常に表示、スマホではチャット選択時のみ表示) */}
      <main className={`flex-1 ${isChatOrProfileRoute ? 'block' : 'hidden md:block'}`}>
        {isChatOrProfileRoute ? (
          <Outlet />
        ) : (
          <div className="hidden md:flex flex-col h-screen justify-center items-center bg-[#798696] text-white">
            <h2 className="text-xl">トークルームを選択してください</h2>
          </div>
        )}
      </main>
    </div>
  );
}