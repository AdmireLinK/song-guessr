import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Check,
  X,
  Settings,
  Play,
  Send,
  Music,
  Volume2,
  VolumeX,
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
  Label,
  Slider,
  Switch,
  Progress,
  ScrollArea,
  DialogTitle,
} from '@/components/ui';
import { LoadingSpinner, PlayerAvatar } from '@/components/sketch';
import { useGameStore } from '@/store/game-store';
import { socketService } from '@/lib/socket';

type SearchSong = {
  id?: string | number;
  name: string;
  artist: string;
  pictureUrl?: string;
};

type GuessFeedback = {
  releaseYearFeedback?: string;
  releaseYear?: number;
  popularityFeedback?: string;
  popularity?: number;
  metaTags?: { shared?: string[] };
  languageMatch?: boolean;
};

type GuessLike = {
  feedback?: GuessFeedback;
};

type RoomSettings = {
  lyricsLineCount: number;
  maxGuessesPerRound: number;
  roundDuration: number;
  endOnFirstCorrect: boolean;
};

export function RoomPage() {
  const navigate = useNavigate();
  const params = useParams();
  const roomIdFromUrl = params.roomId || '';
  const {
    playerName,
    currentRoom,
    players,
    settings,
    isHost,
    gameStatus,
    playersNeedingSongs,
    pendingSubmitterName,
    revealedAnswer,
    spectatorGuesses,
    attemptsByPlayer,
    currentRound,
    guessDeadline,
    myGuesses,
    roundEndData,
    gameEndData,
    chatMessages,
    error,
    setError,
    setPlayerName,
  } = useGameStore();

  const [showSettings, setShowSettings] = useState(false);
  const [joinName, setJoinName] = useState(playerName || '');
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchSong[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [chatText, setChatText] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [timeLeft, setTimeLeft] = useState(0);

  const [roomNameDraft, setRoomNameDraft] = useState('');
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const lastSearchRef = useRef('');
  const lastAudioReadyRoundRef = useRef<number | null>(null);

  useEffect(() => {
    // 直接访问 /room/:roomId 时：若未加入任何房间，则在本页完成 join/create
    if (!currentRoom && roomIdFromUrl) {
      socketService.connect();
    }
  }, [currentRoom, roomIdFromUrl]);

  useEffect(() => {
    // 离开房间 / 被踢 / 断线导致 currentRoom 为空：送回大厅
    if (!currentRoom) {
      navigate('/');
    }
  }, [currentRoom, navigate]);

  const handleJoinOrCreate = () => {
    const name = joinName.trim();
    if (!roomIdFromUrl) {
      setError('缺少房间号');
      return;
    }
    if (!name) {
      setError('请输入昵称');
      return;
    }
    setPlayerName(name);
    setIsJoiningRoom(true);
    socketService.connect();
    socketService.joinOrCreateRoom(roomIdFromUrl, name, roomIdFromUrl);
  };

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [error, setError]);

  // 音频控制
  useEffect(() => {
    if (currentRound && audioRef.current) {
      const audio = audioRef.current;
      audio.src = currentRound.audioUrl;
      audio.currentTime = currentRound.lyricSlice.startTime / 1000;
      audio.volume = volume;

      // 只播放连续数句歌词对应的时间段：播放到 endTime 就立即停止
      const endSec = currentRound.lyricSlice.endTime / 1000;
      const onTimeUpdate = () => {
        if (audio.currentTime >= endSec) {
          audio.pause();
          audio.currentTime = endSec;
        }
      };
      audio.addEventListener('timeupdate', onTimeUpdate);

      const onCanPlay = () => {
        // 音乐加载完成后，通知服务端“可以开始计时”
        const st = useGameStore.getState();
        const meNow = st.players.find((p) => p.name === st.playerName);
        const amSubmitterNow = st.playerName === currentRound.submitterName;
        const amSpectatorNow = !!meNow?.isSpectator || amSubmitterNow;
        if (st.gameStatus !== 'playing') return;
        if (amSpectatorNow) return;
        if (lastAudioReadyRoundRef.current === currentRound.roundNumber) return;
        lastAudioReadyRoundRef.current = currentRound.roundNumber;
        socketService.audioReady({ roundNumber: currentRound.roundNumber });
      };
      audio.addEventListener('canplaythrough', onCanPlay);
      audio.addEventListener('loadeddata', onCanPlay);

      void audio.play().catch(() => {
        // 某些浏览器策略可能阻止自动播放，这里静默处理
      });

      return () => {
        audio.removeEventListener('timeupdate', onTimeUpdate);
        audio.removeEventListener('canplaythrough', onCanPlay);
        audio.removeEventListener('loadeddata', onCanPlay);
      };
    }
  }, [currentRound]);

  // 音量
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = volume;
  }, [volume]);

  // 离开 playing / 进入结算或结束时，确保停止播放（尤其是房主）
  useEffect(() => {
    if (!audioRef.current) return;
    if (gameStatus === 'playing') return;
    audioRef.current.pause();
  }, [gameStatus]);

  // 倒计时
  useEffect(() => {
    if (guessDeadline && gameStatus === 'playing') {
      const interval = setInterval(() => {
        const remaining = Math.max(0, guessDeadline - Date.now());
        setTimeLeft(Math.ceil(remaining / 1000));
        
        if (remaining <= 0) {
          clearInterval(interval);
        }
      }, 100);

      return () => clearInterval(interval);
    }

    // 不在计时状态（旁观/出题/回合结束）
    setTimeLeft(0);
  }, [guessDeadline, gameStatus]);

  // 自动滚动聊天
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleLeaveRoom = () => {
    socketService.leaveRoom();
    navigate('/');
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
      const serverUrl = import.meta.env.VITE_SERVER_URL || import.meta.env.VITE_API_URL || '';
      const response = await fetch(
        `${serverUrl}/api/music/search?keyword=${encodeURIComponent(searchQuery)}&server=netease`
      );
      const data = await response.json();
      console.log('[Search] API response:', data);
      // Backend provides search results with id, name, artist
      setSearchResults(data || []);
      lastSearchRef.current = searchQuery.trim();
      console.log('[Search] Results count:', (data || []).length);
    } catch (error) {
      console.error('[Search] Error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const triggerSearchOnBlur = () => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      lastSearchRef.current = '';
      return;
    }
    if (q === lastSearchRef.current) return;
    void handleSearchSongs();
  };

  const handleSelectSong = (song: SearchSong, mode: 'submit' | 'guess') => {
    if (!song?.name || !song?.artist) {
      console.error('[Room] selected song missing name or artist', song);
      setError('选中的歌曲信息不完整，无法提交');
      return;
    }

    if (mode === 'guess') {
      socketService.guess({
        songId:
          typeof song.id === 'string' || typeof song.id === 'number'
            ? String(song.id)
            : '',
        server: 'netease',
        title: song.name,
        artist: song.artist,
      });
    } else {
      socketService.submitSong({
        name: song.name,
        artist: song.artist,
        server: 'netease',
      });
    }

    setSearchQuery('');
    setSearchResults([]);
  };

  const renderSongSearchPanel = (mode: 'submit' | 'guess') => {
    const title = mode === 'submit' ? '🔍 搜索并提交歌曲' : '🔍 搜索并猜歌';

    return (
      <div className="w-full max-w-2xl mx-auto text-left">
        <div className="text-sm text-muted-foreground mb-2">{title}</div>
        <div className="flex gap-2">
          <div className="flex-1 flex gap-2">
            <Input
              placeholder="搜索歌曲名或歌手..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onBlur={triggerSearchOnBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
              }}
            />
            {isSearching && (
              <div className="px-3 py-2">
                <LoadingSpinner />
              </div>
            )}
          </div>
        </div>

        {searchResults.length > 0 && (
          <div className="mt-3">
            <ScrollArea className="h-64">
              <div className="space-y-2 pr-4">
                {searchResults.map((song, i) => (
                  <div
                    key={`${song.name}-${song.artist}-${i}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer"
                    onClick={() => handleSelectSong(song, mode)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {song.pictureUrl ? (
                        <img
                          src={song.pictureUrl}
                          alt="cover"
                          className="w-10 h-10 rounded border border-sketch-ink object-cover"
                        />
                      ) : (
                        <Music className="w-8 h-8 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <p className="font-sketch truncate">{song.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectSong(song, mode);
                      }}
                    >
                      {mode === 'submit' ? '提交' : '猜它'}
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    );
  };

  const handleSendChat = () => {
    if (!chatText.trim()) return;
    socketService.sendMessage(chatText.trim());
    setChatText('');
  };

  const handleUpdateSettings = (newSettings: Partial<RoomSettings>) => {
    socketService.updateSettings(newSettings);
  };

  const me = players.find((p) => p.name === playerName);
  const allReady = players.every((p) => p.isReady);
  const needToSubmitSong = playersNeedingSongs.includes(playerName);
  const amSubmitter = (currentRound?.submitterName || pendingSubmitterName) === playerName;
  const iGuessedCorrectly = myGuesses.some((g) => g.correct);
  const amSpectator = !!me?.isSpectator || amSubmitter || iGuessedCorrectly;

  useEffect(() => {
    if (currentRoom?.name) setRoomNameDraft(currentRoom.name);
  }, [currentRoom?.name]);

  const handleReplaySnippet = () => {
    if (!currentRound || !audioRef.current) return;
    const audio = audioRef.current;
    audio.currentTime = currentRound.lyricSlice.startTime / 1000;
    void audio.play().catch(() => {});
  };

  const handleRenameRoom = () => {
    if (!isHost) return;
    const name = roomNameDraft.trim();
    if (!name) {
      setError('房间名不能为空');
      return;
    }
    socketService.renameRoom(name);
  };

  const formatGuessFeedback = (guess: GuessLike) => {
    const fb = guess?.feedback;
    if (!fb) return null;

    const year = fb.releaseYearFeedback ? `${fb.releaseYearFeedback} ${fb.releaseYear ?? ''}`.trim() : null;
    const pop = fb.popularityFeedback ? `${fb.popularityFeedback} ${fb.popularity ?? ''}`.trim() : null;
    const sharedTags: string[] = fb.metaTags?.shared || [];

    return (
      <div className="text-xs text-muted-foreground space-y-1 mt-1">
        <div className="flex gap-3 flex-wrap">
          {year && <span>年份: <span className="font-semibold text-foreground">{year}</span></span>}
          {pop && <span>人气: <span className="font-semibold text-foreground">{pop}</span></span>}
          {fb.languageMatch !== undefined && (
            <span>语言: <span className={fb.languageMatch ? 'text-green-700 font-semibold' : 'text-muted-foreground'}>{fb.languageMatch ? '匹配' : '不匹配'}</span></span>
          )}
        </div>
        {sharedTags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {sharedTags.slice(0, 18).map((t: string, idx: number) => (
              <span
                key={`${t}-${idx}`}
                className="px-1.5 py-0.5 rounded border text-[11px] bg-green-50 border-green-200 text-green-700"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (!currentRoom) {
    return (
      <div className="min-h-screen paper-texture p-4">
        <div className="max-w-md mx-auto mt-10">
          <Card>
            <CardHeader>
              <CardTitle>加入房间</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-muted-foreground">
                房间号：<span className="font-mono">{roomIdFromUrl || '（无）'}</span>
              </div>
              <div className="space-y-2">
                <Label>昵称</Label>
                <Input
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinOrCreate()}
                  placeholder="输入昵称后加入/创建"
                />
              </div>
              <Button className="w-full" onClick={handleJoinOrCreate} disabled={isJoiningRoom}>
                {isJoiningRoom ? '进入中...' : '进入房间'}
              </Button>
              {error && (
                <div className="text-sm text-destructive">⚠️ {error}</div>
              )}
              <Button variant="ghost" className="w-full" onClick={() => navigate('/')}>
                返回大厅
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

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
          <div className="flex items-center gap-2 min-w-0">
            {isHost ? (
              <div className="flex items-center gap-2">
                <div className="font-hand text-xl shrink-0">🎵</div>
                <Input
                  value={roomNameDraft}
                  onChange={(e) => setRoomNameDraft(e.target.value)}
                  className="h-8 w-56"
                  placeholder={currentRoom?.name || '修改房间名'}
                  onBlur={() => {
                    const next = roomNameDraft.trim();
                    const cur = (currentRoom?.name || '').trim();
                    if (!next || next === cur) {
                      setRoomNameDraft(currentRoom?.name || '');
                      return;
                    }
                    handleRenameRoom();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                  }}
                />
              </div>
            ) : (
              <div className="font-hand text-xl truncate">🎵 {currentRoom?.name}</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMuted(!isMuted)}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </Button>
            <div className="w-28">
              <Slider
                value={[Math.round(volume * 100)]}
                min={0}
                max={100}
                step={1}
                onValueChange={([v]) => setVolume(Math.max(0, Math.min(1, v / 100)))}
              />
            </div>
            {isHost && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSettings(true)}
                disabled={gameStatus !== 'idle'}
                title={gameStatus !== 'idle' ? '游戏开始后无法修改设置' : undefined}
              >
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
                        {renderSongSearchPanel('submit')}
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

            {gameStatus === 'waiting_submitter' && (
              <Card>
                <CardHeader>
                  <CardTitle>🧑‍🎤 选择出题人</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-6 space-y-4">
                    <p className="text-muted-foreground font-sketch">
                      {isHost ? '请选择本轮出题人（他/她将提交一首歌供大家猜）' : '等待房主选择出题人...'}
                    </p>
                    {isHost && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl mx-auto">
                        {players.map((p) => (
                          <Button
                            key={`submitter-${p.name}`}
                            variant={p.name === playerName ? 'secondary' : 'default'}
                            onClick={() => socketService.chooseSubmitter(p.name)}
                          >
                            {p.name}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {gameStatus === 'waiting_song' && (
              <Card>
                <CardHeader>
                  <CardTitle>🎵 等待出题</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-6 space-y-4">
                    <p className="text-muted-foreground font-sketch">
                      本轮出题人：<span className="font-semibold text-foreground">{pendingSubmitterName || '（未选择）'}</span>
                    </p>
                    {amSubmitter ? (
                      <>
                        <p className="text-muted-foreground font-sketch">
                          你是出题人，搜索并提交一首歌曲！
                        </p>
                        {renderSongSearchPanel('submit')}
                      </>
                    ) : (
                      <motion.div
                        animate={{ scale: [1, 1.08, 1] }}
                        transition={{ duration: 1, repeat: Infinity }}
                        className="text-4xl"
                      >
                        ⏳
                      </motion.div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {gameStatus === 'playing' && currentRound && (
              <>
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center gap-2">
                      <CardTitle>🎧 第 {currentRound.roundNumber} 轮</CardTitle>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          出题: {currentRound.submitterName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleReplaySnippet}
                          title="重听本段"
                        >
                          重听
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                  {/* 倒计时（每次猜测时长） */}
                  {guessDeadline ? (
                    <div className="mb-4">
                      <div className="flex justify-between text-sm mb-1">
                        <span>本次猜测剩余时间</span>
                        <span className={timeLeft <= 10 ? 'text-destructive font-bold' : ''}>
                          {timeLeft}秒
                        </span>
                      </div>
                      <Progress value={(timeLeft / settings.roundDuration) * 100} />
                    </div>
                  ) : (
                    <div className="mb-4 text-sm text-muted-foreground">
                      {amSpectator
                        ? '观战中：等待其他玩家猜测…'
                        : '音频加载中…加载完成后开始计时'}
                    </div>
                  )}

                  {/* 答案在右侧“答案”卡片展示，避免这里重复显示 */}

                  {/* 歌词显示 */}
                  <div className="bg-muted/50 rounded-lg p-4 mb-4 border-2 border-dashed border-sketch-pencil">
                    <div className="space-y-2 text-center">
                      {currentRound.lyricSlice.lines.map((line, i) => (
                        <motion.p
                          key={`lyric-${currentRound.roundNumber}-${i}-${line.time}`}
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

                  {/* 非旁观者：直接显示搜索框（无需弹窗） */}
                  {!amSpectator && !!guessDeadline && !iGuessedCorrectly && myGuesses.length < settings.maxGuessesPerRound && (
                    <div className="mt-2">
                      {renderSongSearchPanel('guess')}
                    </div>
                  )}
                  </CardContent>
                </Card>

                {/* 猜测历史：独立 Card，放到歌词 Card 的下方 */}
                {(myGuesses.length > 0 || (amSpectator && spectatorGuesses.length > 0)) && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">🧾 猜测历史</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <div className="text-sm text-muted-foreground mb-2">你的猜测</div>
                        {myGuesses.length === 0 ? (
                          <div className="text-xs text-muted-foreground">暂无</div>
                        ) : (
                          <div className="space-y-2">
                            {myGuesses.map((guess, i) => (
                              <div
                                key={guess.id ?? `my-guess-${i}-${guess.guessText.slice(0, 20)}`}
                                className={`text-sm p-2 rounded border ${
                                  guess.correct
                                    ? 'bg-green-50 text-green-700 border-green-200'
                                    : 'bg-muted/40 text-foreground border-muted'
                                }`}
                              >
                                <div className="font-semibold">{guess.correct ? '✅' : '❌'} {guess.guessText}</div>
                                {formatGuessFeedback(guess)}
                              </div>
                            ))}
                            {!iGuessedCorrectly && gameStatus === 'playing' && (
                              <p className="text-xs text-muted-foreground">
                                剩余猜测次数: {settings.maxGuessesPerRound - myGuesses.length}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {amSpectator && (
                        <div>
                          <div className="text-sm text-muted-foreground mb-2">其他玩家</div>
                          {spectatorGuesses.length === 0 ? (
                            <div className="text-xs text-muted-foreground">暂无</div>
                          ) : (
                            <div className="space-y-2">
                              {spectatorGuesses.slice(-20).map((guess, i) => (
                                <div
                                  key={`sp-guess-${guess.playerName}-${guess.timestamp}-${i}`}
                                  className={`text-sm p-2 rounded border ${
                                    guess.correct
                                      ? 'bg-green-50 text-green-700 border-green-200'
                                      : 'bg-muted/40 text-foreground border-muted'
                                  }`}
                                >
                                  <div className="font-semibold">{guess.correct ? '✅' : '❌'} {guess.playerName}: {guess.guessText}</div>
                                  {formatGuessFeedback(guess)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
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
                      {roundEndData.song.album ? ` · ${roundEndData.song.album}` : ''}
                    </p>
                    <div className="text-sm">
                      <p className="text-green-600">
                        ✅ 猜对: {roundEndData.correctGuessers.join(', ') || '无人猜对'}
                      </p>
                    </div>

                    <div className="mt-6 text-left">
                      <div className="text-sm text-muted-foreground mb-2">本轮加/扣分 & 当前总分</div>
                      <div className="space-y-2">
                        {roundEndData.scores.map((s) => (
                          <div
                            key={`roundscore-${s.name}`}
                            className="flex items-center justify-between p-2 rounded bg-muted/40"
                          >
                            <div className="font-sketch truncate">{s.name}</div>
                            <div className="flex items-center gap-4">
                              <div
                                className={`font-mono ${
                                  (s.delta ?? 0) > 0
                                    ? 'text-green-700'
                                    : (s.delta ?? 0) < 0
                                      ? 'text-destructive'
                                      : 'text-muted-foreground'
                                }`}
                              >
                                {(s.delta ?? 0) > 0 ? `+${s.delta}` : `${s.delta ?? 0}`}
                              </div>
                              <div className="font-bold">{s.score} 分</div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {isHost && (
                        <div className="mt-4 flex justify-end">
                          {roundEndData.isFinalRound ? (
                            <Button onClick={() => socketService.finishGame()}>
                              结束游戏
                            </Button>
                          ) : (
                            <Button onClick={() => socketService.nextRound()}>
                              下一轮
                            </Button>
                          )}
                        </div>
                      )}
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
                      <div className="flex items-center gap-2 min-w-0">
                        <PlayerAvatar name={player.name} isHost={player.isHost} />
                        <div className="min-w-0">
                          <p className="font-sketch truncate">{player.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {player.score} 分
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {(currentRound?.submitterName === player.name || pendingSubmitterName === player.name) && (
                          <span className="text-blue-600 text-sm">🎤 出题</span>
                        )}
                        {player.isSpectator && (
                          <span className="text-muted-foreground text-sm">👀 观战</span>
                        )}

                        {!player.connected ? (
                          <span className="text-destructive text-sm">已掉线</span>
                        ) : gameStatus === 'idle' ? (
                          <span className={player.isReady ? 'text-green-600 text-sm' : 'text-muted-foreground text-sm'}>
                            {player.isReady ? '已准备' : '未准备'}
                          </span>
                        ) : null}

                        {gameStatus === 'playing' && (
                          <div className="flex gap-1 items-center">
                            {(attemptsByPlayer[player.name] || []).map((r, idx) => (
                              <span key={`${player.name}-att-${idx}`} className="text-sm">
                                {r === 'correct' ? '✅' : r === 'timeout' ? '⏰' : '❌'}
                              </span>
                            ))}
                          </div>
                        )}

                        {isHost && player.name !== playerName && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => socketService.kickPlayer(player.name)}
                            title="踢出玩家"
                          >
                            踢出
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* 答案详情（出题人/已猜对玩家） */}
            {revealedAnswer && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">🎯 答案</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-3">
                    {revealedAnswer.pictureUrl && (
                      <img
                        src={revealedAnswer.pictureUrl}
                        alt="cover"
                        className="w-16 h-16 rounded-lg border-2 border-sketch-ink"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="font-hand text-lg truncate">{revealedAnswer.title}</div>
                      <div className="text-sm text-muted-foreground truncate">{revealedAnswer.artist}{revealedAnswer.album ? ` · ${revealedAnswer.album}` : ''}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {revealedAnswer.releaseYear ? `年份 ${revealedAnswer.releaseYear}` : ''}
                        {revealedAnswer.releaseYear && revealedAnswer.popularity !== undefined ? ' · ' : ''}
                        {revealedAnswer.popularity !== undefined ? `人气 ${revealedAnswer.popularity}` : ''}
                      </div>
                      {Array.isArray(revealedAnswer.tags) && revealedAnswer.tags.length > 0 && (
                        <div className="flex gap-1 flex-wrap mt-2">
                          {revealedAnswer.tags.slice(0, 12).map((t, idx) => (
                            <span key={`${t}-${idx}`} className="px-1.5 py-0.5 rounded border bg-muted/40 text-[11px] text-muted-foreground">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

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
    </div>
  );
}
