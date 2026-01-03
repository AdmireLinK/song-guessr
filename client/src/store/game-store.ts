import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface RoomInfo {
  id: string;
  name: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  status: 'waiting' | 'waiting_submitter' | 'waiting_song' | 'playing' | 'round_end' | 'game_end';
  isPrivate: boolean;
}

export interface Player {
  id: string;
  name: string;
  score: number;
  isReady: boolean;
  isHost: boolean;
  isSpectator?: boolean;
  connected: boolean;
  hasSubmittedSong: boolean;
  hasGuessedCorrectly?: boolean;
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

export interface GameSong {
  id: string;
  title: string;
  artist: string;
  album?: string;
  pictureUrl?: string;
  releaseYear?: number;
  popularity?: number;
  language?: string;
  tags?: string[];
}

export interface GuessFeedback {
  releaseYear?: number;
  releaseYearFeedback?: '↑' | '↓' | '=' | '?';
  popularity?: number;
  popularityFeedback?: '↑' | '↓' | '=' | '?';
  languageMatch?: boolean;
  metaTags?: {
    guess: string[];
    shared: string[];
  };
}

export interface GuessResult {
  id?: string;
  correct: boolean;
  playerName: string;
  guessText: string;
  timestamp: number;
  guessNumber: number;
  remainingGuesses?: number;
  feedback?: GuessFeedback;
  guessedSong?: Pick<
    GameSong,
    'id' | 'title' | 'artist' | 'pictureUrl' | 'releaseYear' | 'popularity' | 'language'
  >;
}

export type AttemptResult = 'wrong' | 'timeout' | 'correct';

export interface ChatMessage {
  id?: string;
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
  song: { title: string; artist: string; album?: string; pictureUrl?: string };
  correctGuessers: string[];
  scores: { name: string; score: number; correctGuesses: number; totalGuesses: number; delta?: number }[];
  isFinalRound?: boolean;
}

export interface GameEndData {
  finalScores: { name: string; score: number; isWinner?: boolean }[];
  winner: string;
}

type GameStatus =
  | 'idle'
  | 'waiting_submitter'
  | 'waiting_song'
  | 'waiting_songs'
  | 'playing'
  | 'round_end'
  | 'game_end';
type PageType = 'home' | 'lobby' | 'room';

interface GameState {
  currentPage: PageType;
  connected: boolean;
  error: string | null;
  playerName: string;
  roomList: RoomInfo[];
  currentRoom: RoomInfo | null;
  players: Player[];
  settings: RoomSettings;
  isHost: boolean;
  gameStatus: GameStatus;
  playersNeedingSongs: string[];
  pendingSubmitterName: string | null;
  revealedAnswer: Pick<GameSong, 'id' | 'title' | 'artist' | 'album' | 'pictureUrl' | 'releaseYear' | 'popularity' | 'language' | 'tags'> | null;
  spectatorGuesses: GuessResult[];
  // 每名玩家的本轮尝试结果（用于玩家列表展示：❌/⏰/✅）
  attemptsByPlayer: Record<string, AttemptResult[]>;
  currentRound: RoundData | null;
  // “每次猜测时长”倒计时：当前玩家本次尝试的截止时间（毫秒时间戳）
  guessDeadline: number | null;
  myGuesses: GuessResult[];
  roundEndData: RoundEndData | null;
  gameEndData: GameEndData | null;
  chatMessages: ChatMessage[];
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
  updatePlayerConnected: (playerName: string, connected: boolean) => void;
  updateHost: (newHostName: string) => void;
  leaveRoom: () => void;
  setGameStatus: (status: GameStatus) => void;
  setPlayersNeedingSongs: (players: string[]) => void;
  setPendingSubmitterName: (name: string | null) => void;
  setRevealedAnswer: (song: GameState['revealedAnswer']) => void;
  addSpectatorGuess: (guess: GuessResult) => void;
  setSpectatorGuesses: (guesses: GuessResult[]) => void;
  clearSpectatorGuesses: () => void;
  recordAttempt: (playerName: string, result: AttemptResult) => void;
  clearAttempts: () => void;
  playerSubmittedSong: (playerName: string) => void;
  startRound: (data: RoundData) => void;
  setGuessDeadline: (deadline: number | null) => void;
  addGuessResult: (result: GuessResult) => void;
  playerGuessed: (playerName: string, correct: boolean) => void;
  endRound: (data: RoundEndData) => void;
  endGame: (data: GameEndData) => void;
  addChatMessage: (message: ChatMessage) => void;
  clearChat: () => void;
}

const DEFAULT_SETTINGS: RoomSettings = {
  lyricsLineCount: 5,
  endOnFirstCorrect: false,
  maxGuessesPerRound: 3,
  roundDuration: 60,
  maxRounds: 10,
};

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
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
      pendingSubmitterName: null,
      revealedAnswer: null,
      spectatorGuesses: [],
      attemptsByPlayer: {},
      currentRound: null,
      guessDeadline: null,
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

      updatePlayerConnected: (playerName, connected) => set((state) => ({
        players: state.players.map((p) =>
          p.name === playerName ? { ...p, connected } : p
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
        error: null,
        currentRoom: null,
        players: [],
        settings: DEFAULT_SETTINGS,
        isHost: false,
        gameStatus: 'idle',
        playersNeedingSongs: [],
        pendingSubmitterName: null,
        revealedAnswer: null,
        spectatorGuesses: [],
        currentRound: null,
        guessDeadline: null,
        myGuesses: [],
        attemptsByPlayer: {},
        roundEndData: null,
        gameEndData: null,
        chatMessages: [],
      }),
      
      setGameStatus: (status) => set({ gameStatus: status }),
      
      setPlayersNeedingSongs: (players) => set({ 
        playersNeedingSongs: players,
        gameStatus: players.length > 0 ? 'waiting_songs' : 'playing',
      }),

      setPendingSubmitterName: (name) => set({ pendingSubmitterName: name }),

      setRevealedAnswer: (song) => set({ revealedAnswer: song }),

      addSpectatorGuess: (guess) => set((state) => ({
        spectatorGuesses: [...state.spectatorGuesses, guess],
      })),

      setSpectatorGuesses: (guesses) => set({ spectatorGuesses: guesses }),

      clearSpectatorGuesses: () => set({ spectatorGuesses: [] }),

      recordAttempt: (playerName, result) => set((state) => ({
        attemptsByPlayer: {
          ...state.attemptsByPlayer,
          [playerName]: [...(state.attemptsByPlayer[playerName] || []), result].slice(0, state.settings.maxGuessesPerRound),
        },
      })),

      clearAttempts: () => set({ attemptsByPlayer: {} }),
      
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
        spectatorGuesses: [],
        roundEndData: null,
        guessDeadline: null,
        attemptsByPlayer: {},
      }),

      setGuessDeadline: (deadline) => set({ guessDeadline: deadline }),
      
      addGuessResult: (result) => set((state) => ({
        myGuesses: [...state.myGuesses, result],
      })),
      
      playerGuessed: (playerName, correct) => set((state) => ({
        players: state.players.map((p) =>
          p.name === playerName
            ? { ...p, hasGuessedCorrectly: correct ? true : (p.hasGuessedCorrectly ?? false) }
            : p
        ),
      })),
      
      endRound: (data) => set((state) => ({
        gameStatus: 'round_end',
        roundEndData: data,
        currentRound: null,
        guessDeadline: null,
        attemptsByPlayer: {},
        players: state.players.map((p) => {
          const scoreData = data.scores.find((s) => s.name === p.name);
          return scoreData ? { ...p, score: scoreData.score } : p;
        }),
      })),
      
      endGame: (data) => set({
        gameStatus: 'game_end',
        gameEndData: data,
        currentRound: null,
        guessDeadline: null,
        attemptsByPlayer: {},
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
