import { io, Socket } from 'socket.io-client';
import { useGameStore } from '@/store/game-store';

class SocketService {
  private socket: Socket | null = null;
  private serverUrl: string;
  private listenersSetup = false;

  constructor() {
    // 开发模式下使用空字符串（通过 vite 代理）
    // 生产模式下使用配置的 URL 或当前页面 origin
    const isDev = import.meta.env.DEV;
    if (isDev) {
      // 开发模式：使用 vite dev server 代理，连接到相同 origin
      this.serverUrl = '';
    } else {
      // 生产模式：使用环境变量或页面 origin
      this.serverUrl = import.meta.env.VITE_WS_URL || import.meta.env.VITE_SERVER_URL || '';
    }
    console.log('[Socket] Server URL:', this.serverUrl || '(using relative path)');
  }

  connect(): Socket {
    if (this.socket) {
      if (!this.listenersSetup) {
        this.setupEventListeners();
        this.listenersSetup = true;
      }

      if (this.socket.connected) {
        return this.socket;
      }

      // 复用已有 socket：避免反复 io() 创建新连接导致事件监听重复/房间列表不稳定
      this.socket.connect();
      return this.socket;
    }

    console.log('[Socket] Connecting to:', this.serverUrl ? `${this.serverUrl}/game` : '/game (via proxy)');

    // 开发模式使用 path 而非完整 URL，让 vite 代理处理
    const socketOptions = {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 20000,
      path: '/socket.io/',
    };
    // 连接到带命名空间的 endpoint (/game)
    // 如果有 serverUrl 则连接到指定服务器，否则使用相对路径以便 vite 代理转发
    this.socket = this.serverUrl
      ? io(`${this.serverUrl}/game`, socketOptions)
      : io('/game', socketOptions);

    this.setupEventListeners();
    this.listenersSetup = true;
    return this.socket;
  }

  private setupEventListeners() {
    if (!this.socket) return;

    const store = useGameStore.getState();

    // 连接事件
    this.socket.on('connect', () => {
      console.log('Connected to game server');
      store.setConnected(true);
    });
    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from game server, reason:', reason);
      store.setConnected(false);

      // 非主动断开：提示并送回大厅
      if (reason !== 'io client disconnect') {
        const st = useGameStore.getState();
        if (st.currentRoom) {
          store.leaveRoom();
        }
        store.setError('与服务器连接断开（服务器可能重启/关闭），已返回大厅');
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error && (error.message || error));
      if ((error as any)?.stack) console.error((error as any).stack);
      store.setError(`连接服务器失败: ${error?.message || String(error)}`);
    });

    this.socket.on('connect_timeout', (timeout) => {
      console.error('Connection timeout:', timeout);
      store.setError('连接服务器超时');
    });

    this.socket.io.on('reconnect_attempt', (attempt) => {
      console.log('Socket reconnect attempt', attempt);
    });

    this.socket.io.on('reconnect_failed', () => {
      console.error('Socket reconnect failed');
      store.setError('无法连接到服务器（重连失败）');
    });

    this.socket.on('error', (err) => {
      console.error('Socket general error:', err);
      store.setError(`Socket 错误: ${err?.message || String(err)}`);
    });

    // 房间事件
    this.socket.on('room:list', (rooms) => {
      store.setRoomList(rooms);
    });

    this.socket.on('room:created', (room) => {
      store.setCurrentRoom(room);
    });

    this.socket.on('room:joined', ({ room, players, settings }) => {
      store.setCurrentRoom(room);
      store.setPlayers(players);
      store.setSettings(settings);
    });

    this.socket.on('room:left', () => {
      store.leaveRoom();
    });

    this.socket.on('room:updated', (room) => {
      store.setCurrentRoom(room);
    });

    this.socket.on('room:playerJoined', (player) => {
      store.addPlayer(player);
    });

    this.socket.on('room:playerLeft', ({ playerName }) => {
      store.removePlayer(playerName);
    });

    this.socket.on('room:playerStatus', ({ playerName, connected }) => {
      store.updatePlayerConnected(playerName, connected);
    });

    this.socket.on('room:playerReady', ({ playerName, isReady }) => {
      store.updatePlayerReady(playerName, isReady);
    });

    this.socket.on('room:settingsChanged', (settings) => {
      store.setSettings(settings);
    });

    this.socket.on('room:hostChanged', ({ newHostName }) => {
      store.updateHost(newHostName);
    });

    this.socket.on('room:kicked', ({ reason }) => {
      store.leaveRoom();
      store.setError(reason);
    });

    this.socket.on('room:dissolved', () => {
      store.leaveRoom();
      store.setError('房间已解散');
    });

    // 游戏事件
    this.socket.on('game:started', () => {
      // 新主玩法：等待房主选择出题人
      store.setGameStatus('waiting_submitter');
    });

    this.socket.on('game:needSubmitter', ({ roundNumber }) => {
      void roundNumber;
      store.setPendingSubmitterName(null);
      store.setRevealedAnswer(null);
      store.clearSpectatorGuesses();
      store.clearAttempts();
      store.setGuessDeadline(null);
      store.setGameStatus('waiting_submitter');
    });

    this.socket.on('game:submitterSelected', ({ submitterName }) => {
      store.setPendingSubmitterName(submitterName);
      store.clearSpectatorGuesses();
      store.clearAttempts();
      store.setGuessDeadline(null);
      // 进入等待出题阶段：只有出题人会打开出题弹窗
      store.setGameStatus('waiting_song');
    });

    this.socket.on('game:answerReveal', ({ song }) => {
      store.setRevealedAnswer(song);
    });

    this.socket.on('game:spectatorGuess', ({ playerName, guess }) => {
      void playerName;
      store.addSpectatorGuess(guess);
    });

    this.socket.on('game:spectatorHistory', ({ guesses }) => {
      const list = Array.isArray(guesses) ? guesses : [];
      store.setSpectatorGuesses(list);

      // 同步尝试结果到玩家列表
      store.clearAttempts();
      for (const g of list) {
        const isTimeout = typeof g?.guessText === 'string' && g.guessText.includes('⏰');
        store.recordAttempt(g.playerName, g.correct ? 'correct' : (isTimeout ? 'timeout' : 'wrong'));
      }
    });

    this.socket.on('game:playerAttempt', ({ playerName, result }) => {
      const r = result === 'timeout' || result === 'wrong' || result === 'correct' ? result : null;
      if (!playerName || !r) return;
      store.recordAttempt(playerName, r);
    });

    this.socket.on('game:waitingForSongs', ({ playersNeeded }) => {
      store.setPlayersNeedingSongs(playersNeeded);
    });

    this.socket.on('game:submitSong', ({ playerName }) => {
      store.playerSubmittedSong(playerName);
    });

    this.socket.on('game:roundStart', (data) => {
      store.startRound(data);

      // “每次猜测时长”：等音频加载完成后由服务端下发 game:guessTimerStart 再开始
      store.setGuessDeadline(null);
    });

    this.socket.on('game:guessTimerStart', ({ roundNumber, deadline }) => {
      const st = useGameStore.getState();
      if (st.gameStatus !== 'playing') return;
      if (!st.currentRound || st.currentRound.roundNumber !== roundNumber) return;
      if (typeof deadline !== 'number') return;

      // 仅对当前玩家设置倒计时（服务端也是点对点下发）
      store.setGuessDeadline(deadline);
    });

    this.socket.on('game:guessResult', (result) => {
      store.addGuessResult(result);

      // 记录自己的尝试类型（❌/⏰/✅）
      const isTimeout = typeof result?.guessText === 'string' && result.guessText.includes('⏰');
      store.recordAttempt(result.playerName, result.correct ? 'correct' : (isTimeout ? 'timeout' : 'wrong'));

      const st = useGameStore.getState();
      if (result.playerName !== st.playerName) return;

      // 猜对或次数用尽则停止计时；否则重置下一次尝试计时
      const remaining = typeof result.remainingGuesses === 'number'
        ? result.remainingGuesses
        : Math.max(0, st.settings.maxGuessesPerRound - st.myGuesses.length);

      if (result.correct || remaining <= 0) {
        store.setGuessDeadline(null);
      } else {
        store.setGuessDeadline(Date.now() + st.settings.roundDuration * 1000);
      }
    });

    this.socket.on('game:playerGuessed', ({ playerName, correct }) => {
      store.playerGuessed(playerName, correct);
    });

    this.socket.on('game:roundEnd', (data) => {
      store.setGuessDeadline(null);
      store.clearAttempts();
      store.endRound(data);
    });

    this.socket.on('game:gameEnd', (data) => {
      store.setGuessDeadline(null);
      store.clearAttempts();
      store.endGame(data);
    });

    // 聊天
    this.socket.on('chat:message', (message) => {
      store.addChatMessage(message);
    });

    // 错误处理
    this.socket.on('error', ({ code, message }) => {
      store.setError(message);
      console.error(`Socket error [${code}]:`, message);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.listenersSetup = false;
    }
  }

  // 房间操作
  createRoom(roomName: string, playerName: string, isPrivate = false, password?: string) {
    this.socket?.emit('room:create', { roomName, playerName, isPrivate, password });
  }

  joinRoom(roomId: string, playerName: string, password?: string) {
    this.socket?.emit('room:join', { roomId, playerName, password });
  }

  joinOrCreateRoom(roomId: string, playerName: string, roomName?: string, password?: string) {
    this.socket?.emit('room:joinOrCreate', { roomId, playerName, roomName, password });
  }

  leaveRoom() {
    this.socket?.emit('room:leave');
  }

  setReady(isReady: boolean) {
    this.socket?.emit('room:ready', { isReady });
  }

  updateSettings(settings: any) {
    this.socket?.emit('room:updateSettings', settings);
  }

  renameRoom(name: string) {
    this.socket?.emit('room:rename', { name });
  }

  kickPlayer(playerName: string) {
    this.socket?.emit('room:kick', { playerName });
  }

  listRooms() {
    this.socket?.emit('room:list');
  }

  // 游戏操作
  startGame() {
    this.socket?.emit('game:start');
  }

  abortGame() {
    this.socket?.emit('game:abort');
  }

  chooseSubmitter(playerName: string) {
    this.socket?.emit('game:chooseSubmitter', { playerName });
  }

  submitSong(data: { name: string; artist: string; server: 'netease' | 'qq' } | string, server?: 'netease' | 'qq') {
    // Support both old (songId, server) and new (data object) signatures
    let payload: any;
    if (typeof data === 'string') {
      payload = { songId: data, server: server || 'netease' };
    } else {
      payload = { name: data.name, artist: data.artist, server: data.server };
    }
    this.socket?.emit('game:submitSong', payload);
  }

  guess(selection: { songId: string; server: 'netease' | 'qq'; title?: string; artist?: string }) {
    this.socket?.emit('game:guess', selection);
  }

  skipRound() {
    this.socket?.emit('game:skipRound');
  }

  audioReady(data: { roundNumber: number }) {
    this.socket?.emit('game:audioReady', data);
  }

  nextRound() {
    this.socket?.emit('game:nextRound');
  }

  finishGame() {
    this.socket?.emit('game:finishGame');
  }

  // 聊天
  sendMessage(message: string) {
    this.socket?.emit('chat:send', { message });
  }

  getSocket(): Socket | null {
    return this.socket;
  }
}

export const socketService = new SocketService();
