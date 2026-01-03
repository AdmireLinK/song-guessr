import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
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

export function RoomPage() {
  const navigate = useNavigate();
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
  const [songSelectionMode, setSongSelectionMode] = useState<'submit' | 'guess' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedServer, setSelectedServer] = useState<'netease' | 'qq'>('netease');
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

    if (songSelectionMode === 'guess') {
      socketService.guess({
        songId: song.id,
        server: selectedServer,
        title: song.name,
        artist: song.artist,
      });
    } else {
      socketService.submitSong({
        name: song.name,
        artist: song.artist,
        server: selectedServer,
      });
    }

    setShowSongSearch(false);
    setSongSelectionMode(null);
    setSearchQuery('');
    setSearchResults([]);
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
  const amSubmitter = (currentRound?.submitterName || pendingSubmitterName) === playerName;
  const iGuessedCorrectly = myGuesses.some((g) => g.correct);
  const amSpectator = amSubmitter || iGuessedCorrectly;

  const formatGuessFeedback = (guess: any) => {
    const fb = guess?.feedback;
    if (!fb) return null;

    const year = fb.releaseYearFeedback ? `${fb.releaseYearFeedback} ${fb.releaseYear ?? ''}`.trim() : null;
    const pop = fb.popularityFeedback ? `${fb.popularityFeedback} ${fb.popularity ?? ''}`.trim() : null;
    const tags: string[] = fb.metaTags?.guess || [];
    const sharedSet = new Set((fb.metaTags?.shared || []).map((t: string) => t.toLowerCase()));

    return (
      <div className="text-xs text-muted-foreground space-y-1 mt-1">
        <div className="flex gap-3 flex-wrap">
          {year && <span>年份: <span className="font-semibold text-foreground">{year}</span></span>}
          {pop && <span>人气: <span className="font-semibold text-foreground">{pop}</span></span>}
          {fb.languageMatch !== undefined && (
            <span>语言: <span className={fb.languageMatch ? 'text-green-700 font-semibold' : 'text-muted-foreground'}>{fb.languageMatch ? '匹配' : '不匹配'}</span></span>
          )}
        </div>
        {tags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {tags.slice(0, 18).map((t: string, idx: number) => {
              const isShared = sharedSet.has(t.toLowerCase());
              return (
                <span
                  key={`${t}-${idx}`}
                  className={
                    `px-1.5 py-0.5 rounded border text-[11px] ` +
                    (isShared
                      ? 'bg-green-50 border-green-200 text-green-700'
                      : 'bg-muted/40 border-muted text-muted-foreground')
                  }
                >
                  {t}
                </span>
              );
            })}
          </div>
        )}
      </div>
    );
  };

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
                        <Button onClick={() => { setSongSelectionMode('submit'); setShowSongSearch(true); }} size="lg">
                          <Search className="w-4 h-4 mr-2" />
                          搜索歌曲
                        </Button>
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

                  {/* 猜测选择 */}
                  {currentRound.submitterName !== playerName && (
                    <div className="flex gap-2">
                      <Button
                        onClick={() => { setSongSelectionMode('guess'); setShowSongSearch(true); }}
                        disabled={myGuesses.some((g) => g.correct) || myGuesses.length >= settings.maxGuessesPerRound}
                      >
                        选择歌曲来猜
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleSkipRound}
                        disabled={myGuesses.some((g) => g.correct) || myGuesses.length >= settings.maxGuessesPerRound}
                      >
                        跳过本轮
                      </Button>
                    </div>
                  )}

                  {/* 猜测记录已移动到右侧玩家列表下方 */}
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
                        {(currentRound?.submitterName === player.name || pendingSubmitterName === player.name) && (
                          <span className="text-blue-600 text-sm">🎤 出题</span>
                        )}
                        {player.hasGuessedCorrectly && gameStatus === 'playing' && (
                          <span className="text-green-600 text-sm">✅ 已猜对</span>
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

            {/* 猜测历史（放在玩家列表下方） */}
            {(gameStatus === 'playing' || myGuesses.length > 0 || (amSpectator && spectatorGuesses.length > 0)) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">🧾 猜测记录</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
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

      {/* 搜索歌曲对话框 */}
      <Dialog
        open={showSongSearch}
        onOpenChange={(open) => {
          setShowSongSearch(open);
          if (!open) setSongSelectionMode(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {songSelectionMode === 'guess' ? '🔍 选择要猜的歌曲' : '🔍 选择要提交的歌曲'}
            </DialogTitle>
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
