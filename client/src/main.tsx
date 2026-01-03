import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import { HomePage, LobbyPage, RoomPage, AdminPage, AdminLoginPage } from './pages'

// 遥测服务会在需要时延迟初始化，避免启动时请求后端

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LobbyPage />} />
        <Route path="/lobby" element={<Navigate to="/" replace />} />
        <Route path="/room/:roomId" element={<RoomPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/*" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
