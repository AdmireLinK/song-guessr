import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface RoomInfo {
  id: string;
  name: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  status: 'waiting' | 'playing' | 'round_end' | 'game_end';
  isPrivate: boolean;
}

export interface Player {
  id: string;
  name: string;
  score: number;
  isReady: boolean;
  isHost: boolean;
  connected: boolean;
  hasSubmittedSong: boolean;
}

export interface RoomSettings {
  lyricsLineCount: number;
  endOnFirstCorrect: boolean;
  maxGuessesPerRound: number;
  roundDuration: number;
  maxRounds: number;
}

export interface LyricLine {
  time: number;
  endTime?: number;
  text: string;
}

export interface LyricSlice {
  startTime: number;
  endTime: number;
  lines: LyricLine[];
}

export interface GuessResult {
  correct: boolean;
  playerName: string;
  guessText: string;
  timestamp: number;
  guessNumber: number;
  remainingGuesses?: number;
}

export interface ChatMessage {
  playerName: string;
  message: string;
  timestamp: number;
}

export interface RoundData {
  roundNumber: number;
  audioUrl: string;
  lyricSlice: LyricSlice;
  startTime: number;
  endTime: number;
  submitterName: string;
}

export interface RoundEndData {
  song: { title: string; artist: string; pictureUrl: string };
  correctGuessers: string[];
  scores: { name: string; score: number; correctGuesses: number; totalGuesses: number }[];
}

export interface GameEndData {
  finalScores: { name: string; score: number; isWinner?: boolean }[];
  winner: string;
}

type GameStatus = 'idle' | 'waiting_songs' | 'playing' | 'round_end' | 'game_end';
type PageType = 'home' | 'lobby' | 'room';

interface GameState {
  // 页面状态
  currentPage: PageType;

  // 连接状态
  connected: boolean;
  error: string | null;

  // 玩家信息
  playerName: string;
  
  // 房间列表
  roomList: RoomInfo[];
  
  // 当前房间
  currentRoom: RoomInfo | null;
  players: Player[];
  settings: RoomSettings;
  isHost: boolean;
  
  // 游戏状态
  gameStatus: GameStatus;
  playersNeedingSongs: string[];
  currentRound: RoundData | null;
  myGuesses: GuessResult[];
  roundEndData: RoundEndData | null;
  gameEndData: GameEndData | null;
  
  // 聊天
  chatMessages: ChatMessage[];
  
  // Actions
  setCurrentPage: (page: PageType) => void;
  setConnected: (connected: boolean) => void;
  setError: (error: string | null) => void;
  setPlayerName: (name: string) => void;
  setRoomList: (rooms: RoomInfo[]) => void;
  setCurrentRoom: (room: RoomInfo | null) => void;
  setPlayers: (players: Player[]) => void;
  setSettings: (settings: RoomSettings) => void;
  addPlayer: (player: Player) => void;
  removePlayer: (playerName: string) => void;
  updatePlayerReady: (playerName: string, isReady: boolean) => void;
  updateHost: (newHostName: string) => void;
  leaveRoom: () => void;
  
  // 游戏相关
  setGameStatus: (status: GameStatus) => void;
  setPlayersNeedingSongs: (players: string[]) => void;
  playerSubmittedSong: (playerName: string) => void;
  startRound: (data: RoundData) => void;
  addGuessResult: (result: GuessResult) => void;
  playerGuessed: (playerName: string, correct: boolean) => void;
  endRound: (data: RoundEndData) => void;
  endGame: (data: GameEndData) => void;
  
  // 聊天
  addChatMessage: (message: ChatMessage) => void;
  clearChat: () => void;
}

const DEFAULT_SETTINGS: RoomSettings = {
  lyricsLineCount: 3,
  endOnFirstCorrect: false,
  maxGuessesPerRound: 3,
  roundDuration: 60,
  maxRounds: 10,
};

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      // 初始状态
      currentPage: 'home',
      connected: false,
      error: null,
      playerName: '',
      roomList: [],
      currentRoom: null,
      players: [],
      settings: DEFAULT_SETTINGS,
      isHost: false,
      gameStatus: 'idle',
      playersNeedingSongs: [],
      currentRound: null,
      myGuesses: [],
      roundEndData: null,
      gameEndData: null,
      chatMessages: [],

      // Actions
      setCurrentPage: (page) => set({ currentPage: page }),
      
      setConnected: (connected) => set({ connected }),
      
      setError: (error) => set({ error }),
      
      setPlayerName: (name) => set({ playerName: name }),
      
      setRoomList: (rooms) => set({ roomList: rooms }),
      
      setCurrentRoom: (room) => set((state) => ({
        currentRoom: room,
        isHost: room ? state.playerName === room.hostName : false,
      })),
      
      setPlayers: (players) => set({ players }),
      
      setSettings: (settings) => set({ settings }),
      
      addPlayer: (player) => set((state) => ({
        players: [...state.players, player],
        currentRoom: state.currentRoom 
          ? { ...state.currentRoom, playerCount: state.currentRoom.playerCount + 1 }
          : null,
      })),
      
      removePlayer: (playerName) => set((state) => ({
        players: state.players.filter((p) => p.name !== playerName),
        currentRoom: state.currentRoom
          ? { ...state.currentRoom, playerCount: state.currentRoom.playerCount - 1 }
          : null,
      })),
      
      updatePlayerReady: (playerName, isReady) => set((state) => ({
        players: state.players.map((p) =>
          p.name === playerName ? { ...p, isReady } : p
        ),
      })),
      
      updateHost: (newHostName) => set((state) => ({
        currentRoom: state.currentRoom
          ? { ...state.currentRoom, hostName: newHostName }
          : null,
        isHost: state.playerName === newHostName,
        players: state.players.map((p) => ({
          ...p,
          isHost: p.name === newHostName,
        })),
      })),
      
      leaveRoom: () => set({
        currentPage: 'lobby',
        currentRoom: null,
        players: [],
        settings: DEFAULT_SETTINGS,
        isHost: false,
        gameStatus: 'idle',
        playersNeedingSongs: [],
        currentRound: null,
        myGuesses: [],
        roundEndData: null,
        gameEndData: null,
        chatMessages: [],
      }),
      
      setGameStatus: (status) => set({ gameStatus: status }),
      
      setPlayersNeedingSongs: (players) => set({ 
        playersNeedingSongs: players,
        gameStatus: players.length > 0 ? 'waiting_songs' : 'playing',
      }),
      
      playerSubmittedSong: (playerName) => set((state) => ({
        playersNeedingSongs: state.playersNeedingSongs.filter((n) => n !== playerName),
        players: state.players.map((p) =>
          p.name === playerName ? { ...p, hasSubmittedSong: true } : p
        ),
      })),
      
      startRound: (data) => set({
        currentRound: data,
        gameStatus: 'playing',
        myGuesses: [],
        roundEndData: null,
      }),
      
      addGuessResult: (result) => set((state) => ({
        myGuesses: [...state.myGuesses, result],
      })),
      
      playerGuessed: (playerName, correct) => {
        // 可以添加额外的状态更新，比如显示其他玩家的猜测动画
      },
      
      endRound: (data) => set((state) => ({
        gameStatus: 'round_end',
        roundEndData: data,
        currentRound: null,
        players: state.players.map((p) => {
          const scoreData = data.scores.find((s) => s.name === p.name);
          return scoreData ? { ...p, score: scoreData.score } : p;
        }),
      })),
      
      endGame: (data) => set({
        gameStatus: 'game_end',
        gameEndData: data,
        currentRound: null,
      }),
      
      addChatMessage: (message) => set((state) => ({
        chatMessages: [...state.chatMessages.slice(-99), message],
      })),
      
      clearChat: () => set({ chatMessages: [] }),
    }),
    {
      name: 'song-guessr-storage',
      partialize: (state) => ({
        playerName: state.playerName,
      }),
    }
  )
);
