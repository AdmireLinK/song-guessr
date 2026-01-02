import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Shield,
  Users,
  GamepadIcon,
  AlertTriangle,
  RefreshCw,
  LogOut,
  Trash2,
  UserMinus,
  Crown,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ScrollArea,
} from '@/components/ui';
import { SketchDivider, LoadingSpinner } from '@/components/sketch';

interface DashboardStats {
  totalGames: number;
  totalPlayers: number;
  activeToday: number;
  errorCount24h: number;
}

interface DailyStats {
  dates: string[];
  players: number[];
  games: number[];
  guesses: number[];
  errors: number[];
}

interface RoomInfo {
  id: string;
  name: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  status: string;
  isPrivate: boolean;
  players: Array<{ id: string; name: string; isHost: boolean }>;
}

export function AdminPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStats | null>(null);
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [selectedDays, setSelectedDays] = useState(7);
  const [error, setError] = useState<string | null>(null);

  const token = localStorage.getItem('adminToken');
  const serverUrl = import.meta.env.VITE_SERVER_URL || '';

  const fetchData = useCallback(async () => {
    if (!token) {
      navigate('/admin/login');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const headers = { Authorization: `Bearer ${token}` };

      const [dashboardRes, dailyRes, roomsRes] = await Promise.all([
        fetch(`${serverUrl}/api/admin/dashboard`, { headers }),
        fetch(`${serverUrl}/api/admin/stats/daily?days=${selectedDays}`, { headers }),
        fetch(`${serverUrl}/api/admin/rooms`, { headers }),
      ]);

      if (dashboardRes.status === 401 || dailyRes.status === 401) {
        localStorage.removeItem('adminToken');
        navigate('/admin/login');
        return;
      }

      const [dashboard, daily, roomsData] = await Promise.all([
        dashboardRes.json(),
        dailyRes.json(),
        roomsRes.json(),
      ]);

      setDashboardStats(dashboard);
      setDailyStats(daily);
      setRooms(roomsData);
    } catch (err) {
      console.error('Fetch error:', err);
      setError('获取数据失败');
    } finally {
      setIsLoading(false);
    }
  }, [token, serverUrl, selectedDays, navigate]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // 每30秒刷新
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    navigate('/admin/login');
  };

  const handleDissolveRoom = async (roomId: string) => {
    if (!confirm('确定要解散这个房间吗？')) return;

    try {
      const res = await fetch(`${serverUrl}/api/admin/rooms/${roomId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setRooms(rooms.filter((r) => r.id !== roomId));
      }
    } catch (err) {
      console.error('Dissolve room error:', err);
    }
  };

  if (isLoading && !dashboardStats) {
    return (
      <div className="min-h-screen paper-texture flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  // 简单的柱状图组件
  const BarChart = ({ data, labels, title, color }: { data: number[]; labels: string[]; title: string; color: string }) => {
    const max = Math.max(...data, 1);
    return (
      <div className="space-y-2">
        <h4 className="font-sketch text-sm text-muted-foreground">{title}</h4>
        <div className="flex items-end gap-1 h-24">
          {data.map((value, i) => (
            <div key={i} className="flex-1 flex flex-col items-center">
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${(value / max) * 100}%` }}
                className={`w-full ${color} rounded-t min-h-[2px]`}
                title={`${labels[i]}: ${value}`}
              />
              <span className="text-[10px] text-muted-foreground mt-1 rotate-45 origin-left whitespace-nowrap">
                {labels[i].slice(5)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen paper-texture p-4">
      <div className="max-w-6xl mx-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-primary" />
            <h1 className="text-2xl font-hand">管理面板</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-1" />
              退出
            </Button>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <SketchDivider />

        {/* 概览卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <GamepadIcon className="w-8 h-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{dashboardStats?.totalGames || 0}</p>
                  <p className="text-xs text-muted-foreground">总游戏数</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Users className="w-8 h-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{dashboardStats?.totalPlayers || 0}</p>
                  <p className="text-xs text-muted-foreground">总玩家数</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Users className="w-8 h-8 text-purple-500" />
                <div>
                  <p className="text-2xl font-bold">{dashboardStats?.activeToday || 0}</p>
                  <p className="text-xs text-muted-foreground">今日活跃</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-8 h-8 text-red-500" />
                <div>
                  <p className="text-2xl font-bold">{dashboardStats?.errorCount24h || 0}</p>
                  <p className="text-xs text-muted-foreground">24h错误</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 图表区域 */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>📊 数据趋势</CardTitle>
              <select
                value={selectedDays}
                onChange={(e) => setSelectedDays(Number(e.target.value))}
                className="px-3 py-1 rounded border text-sm"
              >
                <option value={7}>最近7天</option>
                <option value={14}>最近14天</option>
                <option value={30}>最近30天</option>
              </select>
            </div>
          </CardHeader>
          <CardContent>
            {dailyStats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <BarChart
                  data={dailyStats.players}
                  labels={dailyStats.dates}
                  title="活跃玩家"
                  color="bg-green-500"
                />
                <BarChart
                  data={dailyStats.games}
                  labels={dailyStats.dates}
                  title="游戏场次"
                  color="bg-blue-500"
                />
                <BarChart
                  data={dailyStats.guesses}
                  labels={dailyStats.dates}
                  title="猜测次数"
                  color="bg-purple-500"
                />
                <BarChart
                  data={dailyStats.errors}
                  labels={dailyStats.dates}
                  title="错误数"
                  color="bg-red-500"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* 房间管理 */}
        <Card>
          <CardHeader>
            <CardTitle>🏠 当前房间 ({rooms.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {rooms.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">暂无活跃房间</p>
            ) : (
              <ScrollArea className="h-64">
                <div className="space-y-3">
                  {rooms.map((room) => (
                    <div
                      key={room.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-sketch">{room.name}</span>
                          {room.isPrivate && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
                              私密
                            </span>
                          )}
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${
                              room.status === 'waiting'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {room.status === 'waiting' ? '等待中' : '游戏中'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          房主: {room.hostName} | 玩家: {room.playerCount}/{room.maxPlayers}
                        </p>
                        <div className="flex gap-1 mt-1">
                          {room.players.map((p) => (
                            <span
                              key={p.id}
                              className="text-xs bg-background px-2 py-0.5 rounded border flex items-center gap-1"
                            >
                              {p.isHost && <Crown className="w-3 h-3 text-yellow-500" />}
                              {p.name}
                            </span>
                          ))}
                        </div>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDissolveRoom(room.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
