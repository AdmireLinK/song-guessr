import { io, Socket } from 'socket.io-client';
import { useGameStore } from '@/store/game-store';

class SocketService {
  private socket: Socket | null = null;
  private serverUrl: string;

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
    if (this.socket?.connected) {
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
      store.setGameStatus('waiting_songs');
    });

    this.socket.on('game:waitingForSongs', ({ playersNeeded }) => {
      store.setPlayersNeedingSongs(playersNeeded);
    });

    this.socket.on('game:submitSong', ({ playerName }) => {
      store.playerSubmittedSong(playerName);
    });

    this.socket.on('game:roundStart', (data) => {
      store.startRound(data);
    });

    this.socket.on('game:guessResult', (result) => {
      store.addGuessResult(result);
    });

    this.socket.on('game:playerGuessed', ({ playerName, correct }) => {
      store.playerGuessed(playerName, correct);
    });

    this.socket.on('game:roundEnd', (data) => {
      store.endRound(data);
    });

    this.socket.on('game:gameEnd', (data) => {
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
    }
  }

  // 房间操作
  createRoom(roomName: string, playerName: string, isPrivate = false, password?: string) {
    this.socket?.emit('room:create', { roomName, playerName, isPrivate, password });
  }

  joinRoom(roomId: string, playerName: string, password?: string) {
    this.socket?.emit('room:join', { roomId, playerName, password });
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

  guess(text: string) {
    this.socket?.emit('game:guess', { guess: text });
  }

  skipRound() {
    this.socket?.emit('game:skipRound');
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
