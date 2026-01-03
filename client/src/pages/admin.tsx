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
  recentGames: Array<{
    roomName?: string;
    startTime?: string;
    playerCount?: number;
    roundCount?: number;
  }>;
  topPlayers: Array<{
    playerName?: string;
    totalScore?: number;
  }>;
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
  currentRound?: number | null;
  createdAt?: string;
  players: Array<{
    id: string;
    name: string;
    score: number;
    isReady: boolean;
    isHost: boolean;
    connected: boolean;
    hasSubmittedSong: boolean;
  }>;
}

interface ActivityStats {
  rangeDays: number;
  guessCount: number;
  errorCount: number;
  activeIpCount?: number;
  series: Array<{
    date: string;
    guesses: number;
    errors: number;
    activeIps: number;
  }>;
}

interface TelemetryItem {
  _id?: string;
  type?: string;
  source?: 'client' | 'server' | string;
  timestamp?: string;
  message?: string;
  stack?: string;
  ip?: string;
  data?: Record<string, any>;
}

export function AdminPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'dashboard' | 'rooms' | 'errors'>('dashboard');
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStats | null>(null);
  const [activity, setActivity] = useState<ActivityStats | null>(null);
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [selectedDays, setSelectedDays] = useState(7);
  const [activityRange, setActivityRange] = useState(7);
  const [errorSource, setErrorSource] = useState<string>('');
  const [errorLogs, setErrorLogs] = useState<TelemetryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const token = localStorage.getItem('adminToken');
  const serverUrl = import.meta.env.VITE_SERVER_URL || import.meta.env.VITE_API_URL || '';

  const fetchData = useCallback(async () => {
    if (!token) {
      navigate('/admin/login');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const headers = { Authorization: `Bearer ${token}` };

      const requests: Array<Promise<Response>> = [];
      const keys: Array<'dashboard' | 'daily' | 'activity' | 'rooms' | 'errors'> = [];

      if (tab === 'dashboard') {
        requests.push(fetch(`${serverUrl}/api/admin/dashboard`, { headers }));
        keys.push('dashboard');
        requests.push(
          fetch(`${serverUrl}/api/admin/stats/daily?days=${selectedDays}`, { headers }),
        );
        keys.push('daily');
        requests.push(
          fetch(`${serverUrl}/api/admin/activity?range=${activityRange}`, { headers }),
        );
        keys.push('activity');
      }

      if (tab === 'rooms') {
        requests.push(fetch(`${serverUrl}/api/admin/rooms`, { headers }));
        keys.push('rooms');
      }

      if (tab === 'errors') {
        const sourceParam = errorSource ? `&source=${encodeURIComponent(errorSource)}` : '';
        requests.push(
          fetch(
            `${serverUrl}/api/admin/telemetry?type=error${sourceParam}&limit=50`,
            { headers },
          ),
        );
        keys.push('errors');
      }

      const responses = await Promise.all(requests);
      const anyUnauthorized = responses.some((r) => r.status === 401);
      if (anyUnauthorized) {
        localStorage.removeItem('adminToken');
        navigate('/admin/login');
        return;
      }

      const jsons = await Promise.all(responses.map((r) => r.json()));
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const payload = jsons[i];
        if (key === 'dashboard') setDashboardStats(payload as DashboardStats);
        if (key === 'daily') setDailyStats(payload as DailyStats);
        if (key === 'activity') setActivity(payload as ActivityStats);
        if (key === 'rooms') setRooms(payload as RoomInfo[]);
        if (key === 'errors') {
          const list = (payload?.data || payload || []) as TelemetryItem[];
          setErrorLogs(list);
        }
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError('获取数据失败');
    } finally {
      setIsLoading(false);
    }
  }, [token, serverUrl, selectedDays, activityRange, errorSource, tab, navigate]);

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

  const postRoomAction = async (
    roomId: string,
    action: 'kick' | 'transfer-host' | 'assign-submitter',
    playerName: string,
    confirmText: string,
  ) => {
    if (!confirm(confirmText)) return;
    if (!token) return;

    try {
      const res = await fetch(`${serverUrl}/api/admin/rooms/${roomId}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ playerName }),
      });

      if (res.status === 401) {
        localStorage.removeItem('adminToken');
        navigate('/admin/login');
        return;
      }

      // 不依赖返回结构，统一刷新房间列表
      await fetchData();
    } catch (err) {
      console.error('Room admin action error:', err);
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
            <Button
              variant={tab === 'dashboard' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTab('dashboard')}
              disabled={isLoading}
            >
              仪表盘
            </Button>
            <Button
              variant={tab === 'rooms' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTab('rooms')}
              disabled={isLoading}
            >
              房间
            </Button>
            <Button
              variant={tab === 'errors' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTab('errors')}
              disabled={isLoading}
            >
              错误日志
            </Button>
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

        {tab === 'dashboard' && (
          <>
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
                      <p className="text-xs text-muted-foreground">总玩家数(近30天粗口径)</p>
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

            {/* 日统计趋势 */}
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>📊 数据趋势（日统计）</CardTitle>
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

            {/* Activity（兼容旧管理页的 range 概念） */}
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>📈 活跃/错误/猜测（区间）</CardTitle>
                  <select
                    value={activityRange}
                    onChange={(e) => setActivityRange(Number(e.target.value))}
                    className="px-3 py-1 rounded border text-sm"
                  >
                    <option value={7}>最近7天</option>
                    <option value={14}>最近14天</option>
                    <option value={30}>最近30天</option>
                  </select>
                </div>
              </CardHeader>
              <CardContent>
                {activity ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <Card>
                        <CardContent className="pt-4">
                          <p className="text-2xl font-bold">{activity.activeIpCount ?? 0}</p>
                          <p className="text-xs text-muted-foreground">活跃(口径兼容)</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4">
                          <p className="text-2xl font-bold">{activity.guessCount ?? 0}</p>
                          <p className="text-xs text-muted-foreground">区间猜测次数</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4">
                          <p className="text-2xl font-bold">{activity.errorCount ?? 0}</p>
                          <p className="text-xs text-muted-foreground">区间错误数</p>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                      <BarChart
                        data={activity.series.map((s) => s.activeIps)}
                        labels={activity.series.map((s) => s.date)}
                        title="活跃(按天)"
                        color="bg-green-500"
                      />
                      <BarChart
                        data={activity.series.map((s) => s.guesses)}
                        labels={activity.series.map((s) => s.date)}
                        title="猜测(按天)"
                        color="bg-purple-500"
                      />
                      <BarChart
                        data={activity.series.map((s) => s.errors)}
                        labels={activity.series.map((s) => s.date)}
                        title="错误(按天)"
                        color="bg-red-500"
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-6">暂无数据</p>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>🏆 排行榜</CardTitle>
                </CardHeader>
                <CardContent>
                  {dashboardStats?.topPlayers?.length ? (
                    <div className="space-y-2">
                      {dashboardStats.topPlayers.map((p, idx) => (
                        <div key={idx} className="flex justify-between items-center p-2 rounded bg-muted/50">
                          <span>
                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`} {' '}
                            {p.playerName || '—'}
                          </span>
                          <span className="font-bold">{p.totalScore ?? 0} 分</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">暂无排行榜数据（当前未持久化玩家积分明细）</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>🕒 最近游戏</CardTitle>
                </CardHeader>
                <CardContent>
                  {dashboardStats?.recentGames?.length ? (
                    <div className="space-y-2">
                      {dashboardStats.recentGames.map((g, idx) => (
                        <div key={idx} className="p-2 rounded bg-muted/50">
                          <div className="flex justify-between">
                            <span className="font-bold">{g.roomName || '—'}</span>
                            <span className="text-xs text-muted-foreground">
                              {g.startTime ? new Date(g.startTime).toLocaleString() : '—'}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            玩家: {g.playerCount ?? '—'} | 回合: {g.roundCount ?? '—'}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">暂无近期游戏数据（已按需求移除明细存储）</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {tab === 'rooms' && (
          <Card>
            <CardHeader>
              <CardTitle>🏠 当前房间 ({rooms.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {rooms.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">暂无活跃房间</p>
              ) : (
                <ScrollArea className="h-[70vh]">
                  <div className="space-y-4">
                    {rooms.map((room) => (
                      <div key={room.id} className="p-4 rounded-lg bg-muted/40">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-sketch text-lg">{room.name}</span>
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
                              {room.currentRound != null && (
                                <span className="text-xs bg-background px-2 py-0.5 rounded border">
                                  当前轮: {room.currentRound}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              房主: {room.hostName} | 玩家: {room.playerCount}/{room.maxPlayers}
                            </p>
                          </div>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDissolveRoom(room.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>

                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                          {room.players.map((p) => (
                            <div
                              key={p.id}
                              className="p-3 rounded bg-background/60 border flex items-start justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {p.isHost && <Crown className="w-4 h-4 text-yellow-500" />}
                                  <span className="font-medium truncate">{p.name}</span>
                                  {!p.connected && (
                                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                                      离线
                                    </span>
                                  )}
                                  {p.hasSubmittedSong && (
                                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                                      已提交
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  分数: {p.score} | {p.isReady ? '已准备' : '未准备'}
                                </div>
                              </div>
                              <div className="flex flex-col gap-1 shrink-0">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    postRoomAction(
                                      room.id,
                                      'transfer-host',
                                      p.name,
                                      `确定将房主转移给 “${p.name}” 吗？`,
                                    )
                                  }
                                >
                                  设为房主
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    postRoomAction(
                                      room.id,
                                      'assign-submitter',
                                      p.name,
                                      `确定将 “${p.name}” 置顶为下一轮优先出题人吗？`,
                                    )
                                  }
                                >
                                  置顶出题
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() =>
                                    postRoomAction(
                                      room.id,
                                      'kick',
                                      p.name,
                                      `确定踢出玩家 “${p.name}” 吗？`,
                                    )
                                  }
                                >
                                  踢出
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        )}

        {tab === 'errors' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>🧯 错误日志</CardTitle>
                <select
                  value={errorSource}
                  onChange={(e) => setErrorSource(e.target.value)}
                  className="px-3 py-1 rounded border text-sm"
                >
                  <option value="">全部来源</option>
                  <option value="client">客户端</option>
                  <option value="server">服务端</option>
                </select>
              </div>
            </CardHeader>
            <CardContent>
              {errorLogs.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">暂无错误日志</p>
              ) : (
                <ScrollArea className="h-[70vh]">
                  <div className="space-y-3">
                    {errorLogs.map((e, idx) => (
                      <div
                        key={e._id || `${idx}`}
                        className="p-3 rounded border-l-4 border-red-400 bg-red-50"
                      >
                        <div className="flex justify-between gap-3">
                          <span className="font-bold text-red-700">
                            {e.source === 'client' ? '🖥️ 客户端' : e.source === 'server' ? '🖧 服务端' : e.source || '未知'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {e.timestamp ? new Date(e.timestamp).toLocaleString() : '—'}
                          </span>
                        </div>
                        <div className="text-sm mt-1 break-words">{e.message || '无消息'}</div>
                        {e.ip && <div className="text-xs text-muted-foreground mt-1">IP: {e.ip}</div>}
                        {e.stack && (
                          <pre className="text-xs text-muted-foreground mt-2 overflow-auto max-h-40 whitespace-pre-wrap">
                            {e.stack}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
