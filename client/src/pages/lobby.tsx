import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Users, Lock, Crown } from 'lucide-react';
import {
  Button,
  Input,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Label,
  Switch,
} from '@/components/ui';
import { SketchLogo, SketchDivider, LoadingSpinner } from '@/components/sketch';
import { useGameStore } from '@/store/game-store';
import { socketService } from '@/lib/socket';

export function LobbyPage() {
  const navigate = useNavigate();
  const { playerName, roomList, currentRoom, error, setError, setPlayerName } = useGameStore();
  const [nameInput, setNameInput] = useState(playerName);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [roomName, setRoomName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    socketService.connect();
    socketService.listRooms();

    const interval = setInterval(() => {
      socketService.listRooms();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // 当成功进入房间后导航到房间页面
    if (currentRoom) {
      navigate(`/room/${currentRoom.id}`);
    }
  }, [currentRoom, navigate]);

  useEffect(() => {
    if (error) {
      // 显示错误3秒后清除
      const timer = setTimeout(() => setError(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [error, setError]);

  const ensurePlayerName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setError('请输入昵称后再加入/创建房间');
      return null;
    }
    setPlayerName(trimmed);
    return trimmed;
  };

  const handleCreateRoom = () => {
    if (!roomName.trim()) return;
    const name = ensurePlayerName();
    if (!name) return;
    
    setIsLoading(true);
    socketService.createRoom(
      roomName.trim(),
      name,
      isPrivate,
      isPrivate ? password : undefined
    );
    
    setShowCreateDialog(false);
    setRoomName('');
    setPassword('');
    setIsPrivate(false);
    setIsLoading(false);
  };

  const handleJoinRoom = (roomId: string, needsPassword: boolean) => {
    const name = ensurePlayerName();
    if (!name) return;
    if (needsPassword) {
      setSelectedRoom(roomId);
      setShowJoinDialog(true);
    } else {
      socketService.joinRoom(roomId, name);
    }
  };

  const handleConfirmJoin = () => {
    const name = ensurePlayerName();
    if (!name) return;
    if (selectedRoom) {
      socketService.joinRoom(selectedRoom, name, joinPassword);
      setShowJoinDialog(false);
      setJoinPassword('');
      setSelectedRoom(null);
    }
  };

  return (
    <div className="min-h-screen paper-texture p-4">
      <div className="max-w-4xl mx-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-6">
          <SketchLogo size="sm" />
          <div className="flex items-center gap-2">
            <Input
              placeholder="输入昵称后再加入/创建"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              className="w-48 text-sm"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const name = ensurePlayerName();
                if (name) setNameInput(name);
              }}
            >
              保存昵称
            </Button>
          </div>
        </div>

        {/* 错误提示 */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-destructive/10 border-2 border-destructive rounded-lg p-3 mb-4 text-center font-sketch text-destructive"
            >
              ⚠️ {error}
            </motion.div>
          )}
        </AnimatePresence>

        <SketchDivider />

        {/* 操作区 */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-hand">🏠 游戏大厅</h2>
          <div className="flex gap-2">
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-1" />
              创建房间
            </Button>
          </div>
        </div>

        {/* 房间列表 */}
        <div className="grid gap-4">
          {roomList.length === 0 ? (
            <Card className="py-12">
              <CardContent className="text-center text-muted-foreground">
                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="text-4xl mb-4"
                >
                  🎵
                </motion.div>
                <p className="font-sketch">还没有房间，创建一个吧！</p>
              </CardContent>
            </Card>
          ) : (
            roomList.map((room, index) => (
              <motion.div
                key={room.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="hover:shadow-sketch-lg transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="text-3xl">
                          {room.status === 'playing' ? '🎮' : '🏠'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-hand text-xl">{room.name}</h3>
                            {room.isPrivate && (
                              <Lock className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground font-sketch">
                            <span className="flex items-center gap-1">
                              <Crown className="w-3 h-3" />
                              {room.hostName}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {room.playerCount}/{room.maxPlayers}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-sketch border ${
                            room.status === 'waiting'
                              ? 'bg-green-100 text-green-700 border-green-300'
                              : 'bg-yellow-100 text-yellow-700 border-yellow-300'
                          }`}
                        >
                          {room.status === 'waiting' ? '等待中' : '游戏中'}
                        </span>
                        <Button
                          onClick={() => handleJoinRoom(room.id, room.isPrivate)}
                          disabled={room.playerCount >= room.maxPlayers}
                          size="sm"
                        >
                          {room.status === 'waiting' ? '加入' : '观战'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
        </div>

        {/* 创建房间对话框 */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>✨ 创建新房间</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>房间名称</Label>
                <Input
                  placeholder="给房间起个名字..."
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  maxLength={30}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>私密房间</Label>
                <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
              </div>
              {isPrivate && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-2"
                >
                  <Label>房间密码</Label>
                  <Input
                    type="password"
                    placeholder="设置密码..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </motion.div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                取消
              </Button>
              <Button onClick={handleCreateRoom} disabled={!roomName.trim() || isLoading}>
                {isLoading ? <LoadingSpinner /> : '创建房间'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 加入私密房间对话框 */}
        <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>🔐 输入房间密码</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Input
                type="password"
                placeholder="请输入密码..."
                value={joinPassword}
                onChange={(e) => setJoinPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirmJoin()}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowJoinDialog(false)}>
                取消
              </Button>
              <Button onClick={handleConfirmJoin}>
                加入房间
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
