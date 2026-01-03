import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Users, Lock, Crown, RefreshCw } from 'lucide-react';
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
import { SketchLogo, LoadingSpinner } from '@/components/sketch';
import { NotebookPage } from '@/components/sketch/NotebookPage';
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

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        socketService.connect();
        socketService.listRooms();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    const onOnline = () => {
      socketService.connect();
      socketService.listRooms();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  useEffect(() => {
    if (currentRoom) {
      navigate(`/room/${currentRoom.id}`);
    }
  }, [currentRoom, navigate]);

  useEffect(() => {
    if (error) {
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
    <div className="min-h-screen p-4 md:p-8">
      <NotebookPage>
        {/* 头部 */}
        <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
          <SketchLogo size="md" />
          
          <div className="flex items-center gap-2 bg-white p-2 rounded-sketch border-2 border-sketch-ink shadow-sketch transform rotate-1">
            <span className="font-hand text-xl px-2">我是:</span>
            <Input
              placeholder="你的名字..."
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={() => {
                const trimmed = nameInput.trim();
                if (!trimmed) return;
                setPlayerName(trimmed);
                setNameInput(trimmed);
              }}
              className="w-40 h-10 border-none shadow-none bg-transparent focus:shadow-none text-xl"
            />
          </div>
        </div>

        {/* 错误提示 */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -20, rotate: -2 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-red-100 border-2 border-red-400 rounded-sketch p-4 mb-6 text-center font-hand text-red-600 text-xl shadow-sketch"
            >
              ⚠️ {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 操作区 */}
        <div className="flex justify-between items-center mb-8">
          <div className="relative">
            <h2 className="text-3xl font-hand font-bold text-sketch-ink">
              游戏大厅
            </h2>
            <div className="absolute -bottom-2 left-0 w-full h-1 bg-yellow-300 -z-10 transform -rotate-1" />
          </div>
          
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                socketService.connect();
                socketService.listRooms();
              }}
              title="刷新列表"
            >
              <RefreshCw className="w-5 h-5" />
            </Button>
            <Button onClick={() => setShowCreateDialog(true)} className="bg-pastel-blue hover:bg-blue-200 text-sketch-ink border-sketch-ink">
              <Plus className="w-5 h-5 mr-2" />
              创建房间
            </Button>
          </div>
        </div>

        {/* 房间列表 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {roomList.length === 0 ? (
            <div className="col-span-full py-12 text-center">
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity }}
                className="text-6xl mb-4 inline-block"
              >
                📝
              </motion.div>
              <p className="font-hand text-2xl text-sketch-pencil">还没有房间，创建一个吧！</p>
            </div>
          ) : (
            roomList.map((room, index) => (
              <motion.div
                key={room.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ scale: 1.02, rotate: index % 2 === 0 ? 1 : -1 }}
              >
                <Card className={`h-full hover:shadow-sketch-lg transition-all cursor-pointer ${
                  index % 3 === 0 ? 'bg-pastel-yellow' : 
                  index % 3 === 1 ? 'bg-pastel-green' : 'bg-pastel-pink'
                }`}>
                  <CardContent className="p-5 flex flex-col h-full justify-between">
                    <div>
                      <div className="flex items-start justify-between mb-3">
                        <div className="text-4xl">
                          {room.status === 'playing' ? '🎮' : '🏠'}
                        </div>
                        {room.isPrivate && (
                          <Lock className="w-5 h-5 text-sketch-ink/60" />
                        )}
                      </div>
                      
                      <h3 className="font-hand text-2xl font-bold mb-2 line-clamp-1" title={room.name}>
                        {room.name}
                      </h3>
                      
                      <div className="space-y-1 text-sketch-ink/80 font-hand text-lg">
                        <div className="flex items-center gap-2">
                          <Crown className="w-4 h-4" />
                          <span className="truncate">{room.hostName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          <span>{room.playerCount}/{room.maxPlayers} 人</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <span className={`px-3 py-1 rounded-full text-sm font-bold border-2 border-sketch-ink ${
                        room.status === 'waiting'
                          ? 'bg-white text-green-600'
                          : 'bg-sketch-ink text-white'
                      }`}>
                        {room.status === 'waiting' ? '等待中' : '游戏中'}
                      </span>
                      <Button
                        onClick={() => handleJoinRoom(room.id, room.isPrivate)}
                        disabled={room.playerCount >= room.maxPlayers}
                        size="sm"
                        variant="ghost"
                        className="hover:bg-white/50"
                      >
                        {room.status === 'waiting' ? '加入 ->' : '观战 ->'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
        </div>

        {/* 创建房间对话框 */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="bg-white rounded-sketch border-2 border-sketch-ink shadow-sketch-lg">
            <DialogHeader>
              <DialogTitle className="font-hand text-3xl text-center">✨ 创建新房间</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label className="font-hand text-xl">房间名称</Label>
                <Input
                  placeholder="给房间起个名字..."
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  maxLength={30}
                  className="text-xl"
                />
              </div>
              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-sketch border border-gray-200">
                <Label className="font-hand text-xl">私密房间</Label>
                <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
              </div>
              <AnimatePresence>
                {isPrivate && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2 overflow-hidden"
                  >
                    <Label className="font-hand text-xl">房间密码</Label>
                    <Input
                      type="password"
                      placeholder="设置密码..."
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                取消
              </Button>
              <Button onClick={handleCreateRoom} disabled={!roomName.trim() || isLoading} className="bg-pastel-yellow text-sketch-ink hover:bg-yellow-300">
                {isLoading ? <LoadingSpinner /> : '创建房间'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 加入私密房间对话框 */}
        <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
          <DialogContent className="bg-white rounded-sketch border-2 border-sketch-ink shadow-sketch-lg">
            <DialogHeader>
              <DialogTitle className="font-hand text-3xl text-center">🔐 输入房间密码</DialogTitle>
            </DialogHeader>
            <div className="py-6">
              <Input
                type="password"
                placeholder="请输入密码..."
                value={joinPassword}
                onChange={(e) => setJoinPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirmJoin()}
                className="text-center text-2xl tracking-widest"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowJoinDialog(false)}>
                取消
              </Button>
              <Button onClick={handleConfirmJoin} className="bg-pastel-green text-sketch-ink hover:bg-green-300">
                加入房间
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </NotebookPage>
    </div>
  );
}
