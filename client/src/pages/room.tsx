import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Crown,
  Check,
  X,
  Settings,
  Play,
  Search,
  Send,
  Music,
  Volume2,
  VolumeX,
  SkipForward,
} from 'lucide-react';
import {
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Label,
  Slider,
  Switch,
  Progress,
  ScrollArea,
} from '@/components/ui';
import { SketchDivider, LoadingSpinner, PlayerAvatar } from '@/components/sketch';
import { useGameStore } from '@/store/game-store';
import { socketService } from '@/lib/socket';

export function RoomPage() {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const {
    playerName,
    currentRoom,
    players,
    settings,
    isHost,
    gameStatus,
    playersNeedingSongs,
    currentRound,
    myGuesses,
    roundEndData,
    gameEndData,
    chatMessages,
    error,
    setError,
  } = useGameStore();

  const [showSettings, setShowSettings] = useState(false);
  const [showSongSearch, setShowSongSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedServer, setSelectedServer] = useState<'netease' | 'qq'>('netease');
  const [guessText, setGuessText] = useState('');
  const [chatText, setChatText] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!playerName || !currentRoom) {
      navigate('/lobby');
    }
  }, [playerName, currentRoom, navigate]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [error, setError]);

  // 音频控制
  useEffect(() => {
    if (currentRound && audioRef.current) {
      audioRef.current.src = currentRound.audioUrl;
      audioRef.current.currentTime = currentRound.lyricSlice.startTime / 1000;
      audioRef.current.play();
    }
  }, [currentRound]);

  // 倒计时
  useEffect(() => {
    if (currentRound && gameStatus === 'playing') {
      const interval = setInterval(() => {
        const remaining = Math.max(0, currentRound.endTime - Date.now());
        setTimeLeft(Math.ceil(remaining / 1000));
        
        if (remaining <= 0) {
          clearInterval(interval);
        }
      }, 100);

      return () => clearInterval(interval);
    }
  }, [currentRound, gameStatus]);

  // 自动滚动聊天
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleLeaveRoom = () => {
    socketService.leaveRoom();
    navigate('/lobby');
  };

  const handleToggleReady = () => {
    const me = players.find((p) => p.name === playerName);
    if (me && !me.isHost) {
      socketService.setReady(!me.isReady);
    }
  };

  const handleStartGame = () => {
    socketService.startGame();
  };

  const handleSearchSongs = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const serverUrl = import.meta.env.VITE_SERVER_URL || '';
      const response = await fetch(
        `${serverUrl}/api/music/search?keyword=${encodeURIComponent(searchQuery)}&server=${selectedServer}`
      );
      const data = await response.json();
      console.log('[Search] API response:', data);
      // Backend provides search results with id, name, artist
      setSearchResults(data || []);
      console.log('[Search] Results count:', (data || []).length);
    } catch (error) {
      console.error('[Search] Error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSong = (song: any) => {
    if (!song?.name || !song?.artist) {
      console.error('[Room] selected song missing name or artist', song);
      setError && setError('选中的歌曲信息不完整，无法提交');
      return;
    }

    console.log('[Room] submitting song', { song: { name: song.name, artist: song.artist }, server: selectedServer });
    // Pass name and artist to backend for re-search
    socketService.submitSong({
      name: song.name,
      artist: song.artist,
      server: selectedServer
    });
    setShowSongSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleGuess = () => {
    if (!guessText.trim()) return;
    socketService.guess(guessText.trim());
    setGuessText('');
  };

  const handleSendChat = () => {
    if (!chatText.trim()) return;
    socketService.sendMessage(chatText.trim());
    setChatText('');
  };

  const handleUpdateSettings = (newSettings: any) => {
    socketService.updateSettings(newSettings);
  };

  const handleSkipRound = () => {
    socketService.skipRound();
  };

  const me = players.find((p) => p.name === playerName);
  const allReady = players.every((p) => p.isReady);
  const needToSubmitSong = playersNeedingSongs.includes(playerName);

  return (
    <div className="min-h-screen paper-texture p-4">
      <audio ref={audioRef} muted={isMuted} />
      
      <div className="max-w-6xl mx-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={handleLeaveRoom}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            离开房间
          </Button>
          <div className="font-hand text-xl">
            🎵 {currentRoom?.name}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMuted(!isMuted)}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </Button>
            {isHost && (
              <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
                <Settings className="w-4 h-4" />
              </Button>
            )}
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 主游戏区域 */}
          <div className="lg:col-span-2 space-y-4">
            {/* 游戏状态 */}
            {gameStatus === 'idle' && (
              <Card>
                <CardHeader>
                  <CardTitle>⏳ 等待游戏开始</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    <motion.div
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="text-6xl mb-4"
                    >
                      🎮
                    </motion.div>
                    <p className="text-muted-foreground font-sketch mb-4">
                      等待所有玩家准备...
                    </p>
                    {isHost ? (
                      <Button
                        onClick={handleStartGame}
                        disabled={!allReady || players.length < 2}
                        size="lg"
                      >
                        <Play className="w-4 h-4 mr-2" />
                        开始游戏
                      </Button>
                    ) : (
                      <Button
                        onClick={handleToggleReady}
                        variant={me?.isReady ? 'secondary' : 'default'}
                        size="lg"
                      >
                        {me?.isReady ? (
                          <>
                            <X className="w-4 h-4 mr-2" />
                            取消准备
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4 mr-2" />
                            准备
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {gameStatus === 'waiting_songs' && (
              <Card>
                <CardHeader>
                  <CardTitle>🎵 提交歌曲</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8">
                    {needToSubmitSong ? (
                      <>
                        <p className="text-muted-foreground font-sketch mb-4">
                          选择一首歌曲让其他玩家猜！
                        </p>
                        <Button onClick={() => setShowSongSearch(true)} size="lg">
                          <Search className="w-4 h-4 mr-2" />
                          搜索歌曲
                        </Button>
                      </>
                    ) : (
                      <>
                        <motion.div
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ duration: 1, repeat: Infinity }}
                          className="text-4xl mb-4"
                        >
                          ✅
                        </motion.div>
                        <p className="text-muted-foreground font-sketch">
                          你已提交歌曲，等待其他玩家...
                        </p>
                      </>
                    )}
                    <div className="mt-4 text-sm text-muted-foreground">
                      等待中: {playersNeedingSongs.join(', ') || '无'}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {gameStatus === 'playing' && currentRound && (
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>🎧 第 {currentRound.roundNumber} 轮</CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        出题: {currentRound.submitterName}
                      </span>
                      {isHost && (
                        <Button variant="ghost" size="sm" onClick={handleSkipRound}>
                          <SkipForward className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* 倒计时 */}
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span>剩余时间</span>
                      <span className={timeLeft <= 10 ? 'text-destructive font-bold' : ''}>
                        {timeLeft}秒
                      </span>
                    </div>
                    <Progress value={(timeLeft / settings.roundDuration) * 100} />
                  </div>

                  {/* 歌词显示 */}
                  <div className="bg-muted/50 rounded-lg p-4 mb-4 border-2 border-dashed border-sketch-pencil">
                    <div className="space-y-2 text-center">
                      {currentRound.lyricSlice.lines.map((line, i) => (
                        <motion.p
                          key={`lyric-${currentRound.roundNumber}-${i}-${(line.startTime||0)}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.2 }}
                          className="font-hand text-lg"
                        >
                          ♪ {line.text}
                        </motion.p>
                      ))}
                    </div>
                  </div>

                  {/* 猜测输入 */}
                  {currentRound.submitterName !== playerName && (
                    <div className="flex gap-2">
                      <Input
                        placeholder="输入歌曲名..."
                        value={guessText}
                        onChange={(e) => setGuessText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleGuess()}
                        disabled={myGuesses.some((g) => g.correct) || myGuesses.length >= settings.maxGuessesPerRound}
                      />
                      <Button
                        onClick={handleGuess}
                        disabled={!guessText.trim() || myGuesses.some((g) => g.correct) || myGuesses.length >= settings.maxGuessesPerRound}
                      >
                        猜！
                      </Button>
                    </div>
                  )}

                  {/* 我的猜测记录 */}
                  {myGuesses.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-sm text-muted-foreground">你的猜测：</p>
                      {myGuesses.map((guess, i) => (
                        <div
                          key={guess.id ?? `guess-${i}-${guess.guessText.slice(0,20)}`}
                          className={`text-sm p-2 rounded ${
                            guess.correct
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {guess.correct ? '✅' : '❌'} {guess.guessText}
                        </div>
                      ))}
                      {!myGuesses.some((g) => g.correct) && (
                        <p className="text-xs text-muted-foreground">
                          剩余猜测次数: {settings.maxGuessesPerRound - myGuesses.length}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {gameStatus === 'round_end' && roundEndData && (
              <Card>
                <CardHeader>
                  <CardTitle>🎉 回合结束</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-4">
                    {roundEndData.song.pictureUrl && (
                      <img
                        src={roundEndData.song.pictureUrl}
                        alt="Album"
                        className="w-32 h-32 rounded-lg mx-auto mb-4 border-2 border-sketch-ink shadow-sketch"
                      />
                    )}
                    <h3 className="font-hand text-2xl mb-2">
                      {roundEndData.song.title}
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      {roundEndData.song.artist}
                    </p>
                    <div className="text-sm">
                      <p className="text-green-600">
                        ✅ 猜对: {roundEndData.correctGuessers.join(', ') || '无人猜对'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {gameStatus === 'game_end' && gameEndData && (
              <Card>
                <CardHeader>
                  <CardTitle>🏆 游戏结束</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-4">
                    <motion.div
                      animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 1, repeat: 3 }}
                      className="text-6xl mb-4"
                    >
                      🎊
                    </motion.div>
                    <h3 className="font-hand text-3xl mb-4">
                      🏆 {gameEndData.winner} 获胜！
                    </h3>
                    <div className="space-y-2">
                      {gameEndData.finalScores.map((score, i) => (
                        <div
                          key={score.name ?? `finalscore-${i}`}
                          className={`flex items-center justify-between p-3 rounded-lg ${
                            i === 0 ? 'bg-yellow-100' : 'bg-muted/50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xl">
                              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                            </span>
                            <span className="font-hand">{score.name}</span>
                          </div>
                          <span className="font-bold">{score.score} 分</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* 侧边栏 */}
          <div className="space-y-4">
            {/* 玩家列表 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">👥 玩家 ({players.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {players.map((player, i) => (
                    <div
                      key={player.id ?? `player-${player.name}-${i}`}
                      className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <PlayerAvatar name={player.name} isHost={player.isHost} />
                        <div>
                          <p className="font-sketch">{player.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {player.score} 分
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {player.hasSubmittedSong && gameStatus === 'waiting_songs' && (
                          <span className="text-green-500">🎵</span>
                        )}
                        {player.isReady && gameStatus === 'idle' && (
                          <span className="text-green-500 text-sm">✓ 准备</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* 聊天 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">💬 聊天</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-48 mb-2">
                  <div ref={chatScrollRef} className="space-y-2 pr-4">
                    {chatMessages.map((msg, i) => (
                      <div key={msg.id ?? `chat-${i}-${msg.playerName}` } className="text-sm">
                        <span className="font-bold text-primary">{msg.playerName}:</span>{' '}
                        <span>{msg.message}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <div className="flex gap-2">
                  <Input
                    placeholder="发送消息..."
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                    className="text-sm"
                  />
                  <Button size="sm" onClick={handleSendChat}>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* 设置对话框 */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>⚙️ 房间设置</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>歌词行数: {settings.lyricsLineCount}</Label>
              <Slider
                value={[settings.lyricsLineCount]}
                min={1}
                max={10}
                step={1}
                onValueChange={([v]) => handleUpdateSettings({ lyricsLineCount: v })}
              />
            </div>
            <div className="space-y-2">
              <Label>每轮猜测次数: {settings.maxGuessesPerRound}</Label>
              <Slider
                value={[settings.maxGuessesPerRound]}
                min={1}
                max={10}
                step={1}
                onValueChange={([v]) => handleUpdateSettings({ maxGuessesPerRound: v })}
              />
            </div>
            <div className="space-y-2">
              <Label>每轮时长: {settings.roundDuration}秒</Label>
              <Slider
                value={[settings.roundDuration]}
                min={30}
                max={180}
                step={10}
                onValueChange={([v]) => handleUpdateSettings({ roundDuration: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>第一人猜对后结束回合</Label>
              <Switch
                checked={settings.endOnFirstCorrect}
                onCheckedChange={(v) => handleUpdateSettings({ endOnFirstCorrect: v })}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 搜索歌曲对话框 */}
      <Dialog open={showSongSearch} onOpenChange={setShowSongSearch}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>🔍 搜索歌曲</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <div className="flex-1 flex gap-2">
                <Input
                  placeholder="搜索歌曲名或歌手..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchSongs()}
                />
                <select
                  value={selectedServer}
                  onChange={(e) => setSelectedServer(e.target.value as 'netease' | 'qq')}
                  className="px-3 py-2 rounded-lg border-2 border-sketch-ink bg-background font-sketch"
                >
                  <option value="netease">网易云</option>
                  <option value="qq">QQ音乐</option>
                </select>
              </div>
              <Button onClick={handleSearchSongs} disabled={isSearching}>
                {isSearching ? <LoadingSpinner /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {searchResults.map((song, i) => (
                  <div
                    key={`${song.name}-${song.artist}-${i}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer"
                    onClick={() => handleSelectSong(song)}
                  >
                    <div className="flex items-center gap-3">
                      <Music className="w-8 h-8 text-muted-foreground" />
                      <div>
                        <p className="font-sketch">{song.name}</p>
                        <p className="text-xs text-muted-foreground">{song.artist}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleSelectSong(song); }}>
                      选择
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
