import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button, Input, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { SketchLogo, SketchDecoration, SketchDivider } from '@/components/sketch';
import { useGameStore } from '@/store/game-store';
import { socketService } from '@/lib/socket';
import { telemetryService } from '@/lib/telemetry';

export function HomePage() {
  const navigate = useNavigate();
  const { playerName, setPlayerName, connected, error, setError } = useGameStore();
  const [name, setName] = useState(playerName);
  const [isConnecting, setIsConnecting] = useState(false);

  const handleEnter = async () => {
    if (!name.trim()) return;
    
    setIsConnecting(true);
    setError(null);
    
    try {
      // 只在用户点击进入时才连接
      if (!connected) {
        socketService.connect();
        // 等待连接（最多5秒）
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('连接超时。请确保后端已在 http://localhost:3000 启动'));
          }, 5000);
          const checkConnection = setInterval(() => {
            if (useGameStore.getState().connected) {
              clearInterval(checkConnection);
              clearTimeout(timeout);
              resolve();
            }
          }, 100);
        });
      }
      
      setPlayerName(name.trim());
      telemetryService.setUserId(name.trim());
      telemetryService.trackEvent('player_enter', { playerName: name.trim() });
      navigate('/lobby');
    } catch (err: any) {
      console.error('Failed to connect:', err);
      const errorMsg = err?.message || '无法连接到服务器';
      setError(errorMsg);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="min-h-screen paper-texture flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <SketchDecoration type="music" />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <SketchLogo />
        
        <SketchDivider />
        
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-center">✏️ 输入你的名字</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Input
                placeholder="你的昵称..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEnter()}
                maxLength={20}
                className="text-center text-lg"
              />
              
              <Button
                onClick={handleEnter}
                disabled={!name.trim() || isConnecting}
                className="w-full"
                size="lg"
              >
                {isConnecting ? '连接中...' : '进入游戏大厅 →'}
              </Button>
              
              {error && (
                <div className="text-sm text-red-500 space-y-2">
                  <p className="text-center font-semibold">⚠️ {error}</p>
                  <div className="text-xs text-gray-600 bg-gray-50 p-3 rounded border border-gray-200">
                    <p className="font-semibold mb-1">💡 启动后端步骤：</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>打开新终端</li>
                      <li>cd C:\Users\35407\Desktop\Codes\song-guessr\server</li>
                      <li>pnpm start:dev</li>
                    </ol>
                  </div>
                </div>
              )}
              
              {isConnecting && (
                <p className="text-sm text-muted-foreground text-center">
                  🔌 正在连接服务器...
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        
        <motion.div
          className="mt-8 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <p className="text-sm text-muted-foreground font-sketch">
            📝 游戏规则：
          </p>
          <ul className="text-xs text-muted-foreground mt-2 space-y-1">
            <li>• 创建或加入房间</li>
            <li>• 每个人提交一首歌曲</li>
            <li>• 根据歌词片段猜歌名</li>
            <li>• 猜对得分，看谁最厉害！</li>
          </ul>
        </motion.div>
      </motion.div>
    </div>
  );
}
