// 游戏相关的类型定义

export interface RoomSettings {
  lyricsLineCount: number; // 歌词显示的句数 (1-10)
  endOnFirstCorrect: boolean; // 第一人猜对后结束 vs 等所有人猜完
  maxGuessesPerRound: number; // 每轮每人最大猜测次数
  roundDuration: number; // 每轮时间限制（秒）
  maxRounds: number; // 最大轮数
}

export interface LyricLine {
  time: number; // 开始时间（毫秒）
  endTime?: number; // 结束时间（毫秒）
  text: string; // 歌词文本
}

export interface GameSong {
  id: string;
  title: string;
  artist: string;
  album?: string;
  audioUrl: string;
  pictureUrl: string;
  lyrics: LyricLine[];
  submittedBy: string;
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

export interface LyricSlice {
  startTime: number; // 切片开始时间
  endTime: number; // 切片结束时间
  lines: LyricLine[]; // 切片包含的歌词行
}

export interface Player {
  id: string; // Socket ID
  name: string;
  score: number;
  isReady: boolean;
  isHost: boolean;
  isSpectator?: boolean;
  guessesThisRound: number;
  correctGuessesTotal: number;
  totalGuessesTotal: number;
  songsSubmitted: number;
  hasGuessedCorrectly: boolean;
  submittedSong?: GameSong;
  connected: boolean;
}

export interface GuessResult {
  correct: boolean;
  playerName: string;
  guessText: string;
  timestamp: number;
  guessNumber: number;
  feedback?: GuessFeedback;
  guessedSong?: Pick<
    GameSong,
    | 'id'
    | 'title'
    | 'artist'
    | 'pictureUrl'
    | 'releaseYear'
    | 'popularity'
    | 'language'
  >;
}

export interface RoundState {
  roundNumber: number;
  song: GameSong | null;
  lyricSlice: LyricSlice | null;
  startTime: number;
  endTime?: number;
  guesses: GuessResult[];
  correctGuessers: string[]; // 猜对的玩家名
  isActive: boolean;
  submitterName: string;
}

export type RoomStatus =
  | 'waiting'
  | 'waiting_submitter'
  | 'waiting_song'
  | 'playing'
  | 'round_end'
  | 'game_end';

export interface Room {
  id: string;
  name: string;
  hostId: string;
  hostName: string;
  players: Map<string, Player>;
  settings: RoomSettings;
  status: RoomStatus;
  currentRound: RoundState | null;
  roundHistory: RoundState[];
  songQueue: GameSong[];
  pendingSubmitterName?: string;
  createdAt: Date;
  maxPlayers: number;
  isPrivate: boolean;
  password?: string;
}

export interface RoomInfo {
  id: string;
  name: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  status: RoomStatus;
  isPrivate: boolean;
}

// WebSocket 事件类型
export interface ServerToClientEvents {
  // 房间相关
  'room:created': (room: RoomInfo) => void;
  'room:joined': (data: {
    room: RoomInfo;
    players: PlayerInfo[];
    settings: RoomSettings;
  }) => void;
  'room:left': (data: { playerName: string }) => void;
  'room:updated': (room: RoomInfo) => void;
  'room:playerJoined': (player: PlayerInfo) => void;
  'room:playerLeft': (data: { playerName: string }) => void;
  'room:playerStatus': (data: {
    playerName: string;
    connected: boolean;
  }) => void;
  'room:playerReady': (data: { playerName: string; isReady: boolean }) => void;
  'room:settingsChanged': (settings: RoomSettings) => void;
  'room:hostChanged': (data: { newHostName: string }) => void;
  'room:list': (rooms: RoomInfo[]) => void;
  'room:kicked': (data: { reason: string }) => void;
  'room:dissolved': () => void;

  // 游戏相关
  'game:started': () => void;
  'game:needSubmitter': (data: { roundNumber: number }) => void;
  'game:submitterSelected': (data: { submitterName: string }) => void;
  'game:answerReveal': (data: {
    song: Pick<
      GameSong,
      | 'id'
      | 'title'
      | 'artist'
      | 'album'
      | 'pictureUrl'
      | 'releaseYear'
      | 'popularity'
      | 'language'
      | 'tags'
    >;
  }) => void;
  'game:spectatorGuess': (data: {
    playerName: string;
    guess: GuessResult;
  }) => void;
  'game:roundStart': (data: {
    roundNumber: number;
    audioUrl: string;
    lyricSlice: LyricSlice;
    startTime: number;
    endTime: number;
    submitterName: string;
  }) => void;
  'game:guessResult': (
    result: GuessResult & { remainingGuesses: number },
  ) => void;
  'game:playerGuessed': (data: {
    playerName: string;
    correct: boolean;
  }) => void;
  'game:roundEnd': (data: {
    song: { title: string; artist: string; pictureUrl: string };
    correctGuessers: string[];
    scores: PlayerScore[];
  }) => void;
  'game:gameEnd': (data: {
    finalScores: PlayerScore[];
    winner: string;
  }) => void;
  'game:submitSong': (data: { playerName: string }) => void;
  'game:waitingForSongs': (data: { playersNeeded: string[] }) => void;

  // 聊天
  'chat:message': (data: {
    playerName: string;
    message: string;
    timestamp: number;
  }) => void;

  // 错误
  error: (data: { code: string; message: string }) => void;
}

export interface ClientToServerEvents {
  // 房间相关
  'room:create': (data: {
    roomName: string;
    playerName: string;
    isPrivate?: boolean;
    password?: string;
  }) => void;
  'room:join': (data: {
    roomId: string;
    playerName: string;
    password?: string;
  }) => void;
  'room:joinOrCreate': (data: {
    roomId: string;
    playerName: string;
    roomName?: string;
    password?: string;
  }) => void;
  'room:leave': () => void;
  'room:ready': (data: { isReady: boolean }) => void;
  'room:updateSettings': (settings: Partial<RoomSettings>) => void;
  'room:kick': (data: { playerName: string }) => void;
  'room:list': () => void;

  // 游戏相关
  'game:start': () => void;
  'game:chooseSubmitter': (data: { playerName: string }) => void;
  'game:guess': (data: {
    songId: string;
    server: 'netease' | 'qq';
    title?: string;
    artist?: string;
  }) => void;
  'game:submitSong': (data: {
    songId: string;
    server: 'netease' | 'qq';
  }) => void;
  'game:skipRound': () => void;

  // 聊天
  'chat:send': (data: { message: string }) => void;
}

export interface PlayerInfo {
  id: string;
  name: string;
  score: number;
  isReady: boolean;
  isHost: boolean;
  isSpectator?: boolean;
  connected: boolean;
  hasSubmittedSong: boolean;
}

export interface PlayerScore {
  name: string;
  score: number;
  correctGuesses: number;
  totalGuesses: number;
  isWinner?: boolean;
}

// 计分规则
export const SCORING = {
  CORRECT_GUESS_BASE: 100, // 猜对基础分
  CORRECT_GUESS_SPEED_BONUS: 50, // 第一个猜对额外加分
  SUBMITTER_PER_CORRECT: 20, // 出题者：每有一人猜对加分
  SUBMITTER_ALL_CORRECT: -30, // 出题者：所有人都猜对扣分
  SUBMITTER_NONE_CORRECT: 50, // 出题者：没人猜对加分
  SUBMITTER_SELF_GUESS: -50, // 出题者自己猜自己的歌扣分
} as const;

// 默认房间设置
export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  lyricsLineCount: 3,
  endOnFirstCorrect: false,
  maxGuessesPerRound: 3,
  roundDuration: 60,
  maxRounds: 10,
};
