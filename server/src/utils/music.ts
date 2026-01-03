import 'dotenv/config';
import {
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
} from 'crypto';

const METING_API_BASE =
  process.env.METING_API_BASE || 'https://meting.baka.website/api';
const METING_TOKEN = process.env.METING_TOKEN || 'token';

const NETEASE_LIKE_API =
  'https://interfacepc.music.163.com/eapi/song/red/count';
const NETEASE_DETAIL_API =
  'https://interfacepc.music.163.com/eapi/music/wiki/home/song/desktop/get';
const NETEASE_EAPI_KEY = Buffer.from('e82ckenh8dichen8', 'utf8');

// QQ音乐API相关配置
const QQ_MUSIC_BASE_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
const QQ_MUSIC_SONG_DETAIL_URL =
  'https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg';
const QQ_MUSIC_LRC_URL =
  'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg';

function generateQQMusicSign(data: any): string {
  const PART_1_INDEXES = [23, 14, 6, 36, 16, 40, 7, 19].filter((x) => x < 40);
  const PART_2_INDEXES = [16, 1, 32, 12, 19, 27, 8, 5];
  const SCRAMBLE_VALUES = [
    89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133,
    143, 161, 121, 179,
  ];

  try {
    const str = JSON.stringify(data);
    const hash = createHash('sha1').update(str).digest('hex').toUpperCase();

    const part1 = PART_1_INDEXES.map((i) => hash[i]).join('');
    const part2 = PART_2_INDEXES.map((i) => hash[i]).join('');

    const part3 = Buffer.alloc(20);
    for (let i = 0; i < SCRAMBLE_VALUES.length; i++) {
      const value = SCRAMBLE_VALUES[i] ^ parseInt(hash.substr(i * 2, 2), 16);
      part3[i] = value;
    }

    const b64Part = part3.toString('base64').replace(/[\\/+=]/g, '');
    return `zzc${part1}${b64Part}${part2}`.toLowerCase();
  } catch (error) {
    console.error('Error generating QQ Music sign:', error);
    const str = typeof data === 'object' ? JSON.stringify(data) : String(data);
    return createHash('md5').update(str).digest('hex');
  }
}

export type ServerType = 'netease' | 'qq';

export interface MusicDetail {
  id: string;
  title: string;
  author: string;
  url: string;
  pic: string;
  lrc: string;
}

export interface SongInfo {
  id: string;
  numeric_id?: number;
  name: string;
  artist: string;
  album: string;
  pic_id?: string;
  // 搜索结果里直接带封面 URL（Meting API 会返回 pic 字段）
  pictureUrl?: string;
}

export interface MusicResources {
  audioUrl: string;
  lyrics: string;
  pictureUrl: string;
}

export interface SongLikes {
  count: number;
}

export interface SongDetailInfo {
  date?: string;
  language?: string;
  tags?: string[];
  bpm?: string;
}

export interface MusicDetailWithFullInfo extends MusicDetail, MusicResources {
  detail: SongDetailInfo & SongLikes;
}

function generateToken(
  server: string,
  type: string,
  id: string,
  secret: string = METING_TOKEN,
): string {
  const message = `${server}${type}${id}`;
  return createHmac('sha1', secret).update(message).digest('hex');
}

function generateKey(key: Buffer): Buffer {
  const genKey = Buffer.alloc(16);
  key.copy(genKey, 0, 0, Math.min(16, key.length));

  for (let i = 16; i < key.length; ) {
    for (let j = 0; j < 16 && i < key.length; j++, i++) {
      genKey[j] ^= key[i];
    }
  }

  return genKey;
}

function pkcs7Pad(data: Buffer, blockSize: number): Buffer {
  const padLength = blockSize - (data.length % blockSize);
  const padded = Buffer.alloc(data.length + padLength);
  data.copy(padded);
  padded.fill(padLength, data.length);
  return padded;
}

function pkcs7Unpad(data: Buffer): Buffer {
  if (data.length === 0) {
    return data;
  }
  const padLength = data[data.length - 1];
  return data.slice(0, data.length - padLength);
}

function aesEncryptECB(text: string, key: Buffer): string {
  const { createCipheriv } = require('crypto');
  const genKey = generateKey(key);
  const cipher = createCipheriv('aes-128-ecb', genKey, Buffer.alloc(0));
  cipher.setAutoPadding(false);

  const data = Buffer.from(text, 'utf8');
  const padded = pkcs7Pad(data, 16);

  let encrypted = Buffer.alloc(0);
  for (let i = 0; i < padded.length; i += 16) {
    const block = padded.slice(i, i + 16);
    const encryptedBlock = cipher.update(block);
    encrypted = Buffer.concat([encrypted, encryptedBlock]);
  }

  return encrypted.toString('hex').toUpperCase();
}

function aesDecryptECB(encryptedHex: string, key: Buffer): string {
  const { createDecipheriv } = require('crypto');
  const genKey = generateKey(key);
  const decipher = createDecipheriv('aes-128-ecb', genKey, Buffer.alloc(0));
  decipher.setAutoPadding(false);

  const encrypted = Buffer.from(encryptedHex, 'hex');
  let decrypted = Buffer.alloc(0);

  for (let i = 0; i < encrypted.length; i += 16) {
    const block = encrypted.slice(i, i + 16);
    const decryptedBlock = decipher.update(block);
    decrypted = Buffer.concat([decrypted, decryptedBlock]);
  }

  const unpadded = pkcs7Unpad(decrypted);
  return unpadded.toString('utf8');
}

function eapiEncrypt(path: string, data: string): string {
  const nobodyKnowThis = '36cd479b6b5';
  const text = `nobody${path}use${data}md5forencrypt`;
  const md5 = createHash('md5').update(text).digest('hex');

  const encryptedText = `${path}-${nobodyKnowThis}-${data}-${nobodyKnowThis}-${md5}`;
  const encrypted = aesEncryptECB(encryptedText, NETEASE_EAPI_KEY);
  return encrypted;
}

function eapiDecrypt(encData: string): { path: string; data: any } {
  const decrypted = aesDecryptECB(encData, NETEASE_EAPI_KEY);
  const parts = decrypted.split('-36cd479b6b5-');

  if (parts.length !== 3) {
    throw new Error('Invalid eapi response format');
  }

  return {
    path: parts[0],
    data: JSON.parse(parts[1]),
  };
}

function dataDecrypt(encData: Buffer): any {
  const decrypted = aesDecryptECB(encData.toString('hex'), NETEASE_EAPI_KEY);
  return JSON.parse(decrypted);
}

function getNeteaseCookieHeader(): string {
  const cookieJson = process.env.NETEASE_COOKIE;
  if (!cookieJson) {
    return '';
  }

  try {
    const cookies = JSON.parse(cookieJson);
    const cookieString = Object.entries(cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
    return cookieString;
  } catch (error) {
    console.error('Failed to parse NETEASE_COOKIE:', error);
    return '';
  }
}

async function fetchMetingAPI(
  server: ServerType,
  type: string,
  id: string,
  needAuth: boolean = false,
): Promise<any> {
  const url = new URL(METING_API_BASE);
  url.searchParams.append('server', server);
  url.searchParams.append('type', type);
  url.searchParams.append('id', id);

  if (needAuth) {
    const token = generateToken(server, type, id);
    url.searchParams.append('auth', token);
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    const errorMessage =
      response.headers.get('x-error-message') || `HTTP ${response.status}`;
    throw new Error(`Meting API error: ${errorMessage}`);
  }

  if (type === 'url' || type === 'pic') {
    return response.url;
  }

  return response.text();
}

// QQ音乐API相关函数
async function fetchQQMusicAPI(
  url: string,
  params: Record<string, any>,
): Promise<any> {
  const urlObj = new URL(url);
  Object.entries(params).forEach(([key, value]) => {
    urlObj.searchParams.append(key, String(value));
  });

  const response = await fetch(urlObj.toString(), {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`QQ Music API error: HTTP ${response.status}`);
  }

  const text = await response.text();

  // 处理QQ音乐API返回的JSONP格式
  if (text.startsWith('callback(')) {
    const jsonStr = text.replace(/^callback\((.*)\)$/, '$1');
    return JSON.parse(jsonStr);
  }
  // 处理QQ音乐API返回的带版权声明的JSON
  if (text.includes('jsonCallback(')) {
    const jsonStr = text.replace(/^.*jsonCallback\((.*)\).*$/, '$1');
    return JSON.parse(jsonStr);
  }
  // 直接返回JSON
  return JSON.parse(text);
}

async function getQQMusicSongDetail(songId: string): Promise<SongInfo[]> {
  try {
    // 使用更简单的QQ音乐API端点
    const params = {
      songmid: songId,
      format: 'json',
      inCharset: 'utf8',
      outCharset: 'utf-8',
      notice: 0,
      platform: 'yqq.json',
      needNewCode: 0,
    };

    const result = await fetchQQMusicAPI(QQ_MUSIC_SONG_DETAIL_URL, params);

    // 检查返回的数据结构
    if (!result || !result.data || !result.data.length) {
      console.log('QQ Music API returned empty data');
      return [];
    }

    const songData = result.data[0];

    // QQ音乐API返回的字段名是 mid
    if (!songData.mid) {
      console.log('QQ Music API returned invalid song data');
      return [];
    }

    return [
      {
        id: songData.mid,
        numeric_id: songData.id,
        name: songData.name,
        artist: songData.singer
          ? songData.singer.map((s: any) => s.name).join(',')
          : '',
        album: songData.album?.name || '',
        pic_id: songData.album?.mid || '',
      },
    ];
  } catch (error) {
    console.error('Error in getQQMusicSongDetail:', error);
    return [];
  }
}

async function getQQMusicAudioUrl(songId: string): Promise<string> {
  // 直接返回空字符串，因为获取QQ音乐音频URL需要复杂的签名
  return '';
}

async function getQQMusicLyrics(songId: string): Promise<string> {
  try {
    const params = {
      songmid: songId,
      format: 'json',
      inCharset: 'utf8',
      outCharset: 'utf-8',
      notice: 0,
      platform: 'yqq.json',
      needNewCode: 0,
    };

    const result = await fetchQQMusicAPI(QQ_MUSIC_LRC_URL, params);

    if (!result || !result.lyric) {
      return '';
    }

    // QQ音乐歌词是base64编码的
    const decodedLyrics = Buffer.from(result.lyric, 'base64').toString('utf-8');
    return decodedLyrics;
  } catch (error) {
    console.error('Error fetching QQ music lyrics:', error);
    return '';
  }
}

async function getQQMusicPictureUrl(picId: string): Promise<string> {
  // QQ音乐图片URL格式：https://y.gtimg.cn/music/photo_new/T002R300x300M000${picId}.jpg
  return `https://y.gtimg.cn/music/photo_new/T002R300x300M000${picId}.jpg`;
}

async function getQQMusicDetailInfo(songId: string): Promise<SongDetailInfo> {
  // 使用QQ音乐API获取歌曲详情信息
  try {
    const params = {
      songmid: songId,
      format: 'json',
      inCharset: 'utf8',
      outCharset: 'utf-8',
      notice: 0,
      platform: 'yqq.json',
      needNewCode: 0,
    };

    const result = await fetchQQMusicAPI(QQ_MUSIC_SONG_DETAIL_URL, params);

    if (!result || !result.data || !result.data.length) {
      return {};
    }

    const songData = result.data[0];
    const detailInfo: SongDetailInfo = {};

    // 处理发行时间
    if (songData.time_public) {
      detailInfo.date = songData.time_public;
    }

    // 处理语言
    if (songData.language) {
      detailInfo.language = songData.language;
    }

    // 处理标签 - QQ音乐的genre是数字代码，需要映射为字符串
    if (songData.genre !== undefined && songData.genre !== null) {
      const genreMap: Record<number, string> = {
        1: '流行',
        2: '摇滚',
        3: '民谣',
        4: '电子',
        5: '说唱',
        6: '爵士',
        7: '古典',
        8: '轻音乐',
        9: '影视原声',
        10: 'ACG',
        11: '古风',
        12: '其他',
      };
      const genreName = genreMap[songData.genre] || '其他';
      detailInfo.tags = [genreName];
    }

    // 处理BPM
    if (songData.bpm) {
      detailInfo.bpm = String(songData.bpm);
    }

    return detailInfo;
  } catch (error) {
    console.error('Error fetching QQ music detail info:', error);
    return {};
  }
}

async function getQQMusicLikes(
  songId: string,
  numericId?: number,
): Promise<SongLikes> {
  try {
    let songNumericId = numericId;
    if (!songNumericId) {
      try {
        const songs = await getQQMusicSongDetail(songId);
        if (songs.length > 0 && songs[0].numeric_id) {
          songNumericId = songs[0].numeric_id;
        }
      } catch (error) {
        console.error('Failed to get numeric ID:', error);
      }
    }

    if (!songNumericId) {
      console.log('No numeric ID available for QQ Music likes API');
      return { count: 0 };
    }

    const requestData = {
      comm: {
        ct: 11,
        cv: 13020508,
        format: 'json',
        inCharset: 'utf-8',
        outCharset: 'utf-8',
        uid: '3931641530',
      },
      'music.musicasset.SongFavRead.GetSongFansNumberById': {
        module: 'music.musicasset.SongFavRead',
        method: 'GetSongFansNumberById',
        param: {
          v_songId: [songNumericId],
        },
      },
    };

    const response = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36 Edg/116.0.1938.54',
        Referer: 'https://y.qq.com/',
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      console.error('QQ Music Likes API error:', response.status);
      return { count: 0 };
    }

    const result = await response.json();
    console.log(
      'QQ Music Likes API response:',
      JSON.stringify(result, null, 2),
    );

    const apiResult =
      result['music.musicasset.SongFavRead.GetSongFansNumberById'];
    if (apiResult && apiResult.code === 0 && apiResult.data) {
      const data = apiResult.data;
      if (data.m_show && data.m_show[songNumericId]) {
        const countStr = data.m_show[songNumericId];
        const count = parseCountString(countStr);
        return { count };
      }
      if (data.m_numbers && data.m_numbers[songNumericId]) {
        return { count: data.m_numbers[songNumericId] };
      }
    }

    return { count: 0 };
  } catch (error) {
    console.error('Error in getQQMusicLikes:', error);
    return { count: 0 };
  }
}

function parseCountString(countStr: string): number {
  const match = countStr.match(/(\d+(?:\.\d+)?)([w万]?)/);
  if (!match) return 0;

  const num = parseFloat(match[1]);
  const unit = match[2];

  if (unit === 'w' || unit === '万') {
    return Math.floor(num * 10000);
  }
  return Math.floor(num);
}

export async function getSongDetail(
  server: ServerType,
  songId: string,
): Promise<SongInfo[]> {
  if (server === 'qq') {
    // 优先使用QQ音乐API获取歌曲详情
    try {
      const qqResult = await getQQMusicSongDetail(songId);
      if (qqResult.length > 0) {
        return qqResult;
      }
    } catch (error) {
      console.error('QQ Music API failed:', error);
    }
    // QQ音乐API失败，直接返回空数组，不尝试使用Meting API
    return [];
  }

  // 只有网易云音乐才使用Meting API
  const data = await fetchMetingAPI(server, 'song', songId);
  const songs = JSON.parse(data);

  return songs.map((song: any) => {
    let picId = '';
    if (song.pic) {
      const url = new URL(song.pic);
      picId = url.searchParams.get('id') || '';
    }

    return {
      id: songId,
      name: song.title,
      artist: song.author,
      album: song.album || '',
      pic_id: picId,
    };
  });
}

export async function getSongDetailByNameArtist(
  server: ServerType,
  name: string,
  artist: string,
): Promise<(MusicDetail & MusicResources) | null> {
  try {
    console.log(
      `[Music] getSongDetailByNameArtist: searching for "${name}" - ${artist}`,
    );

    // Search for the song by name
    const searchResults = await searchSongs(name, server);
    console.log(`[Music] Search results: ${searchResults.length} found`);

    if (searchResults.length === 0) {
      console.warn(`[Music] No search results for "${name}" by "${artist}"`);
      return null;
    }

    // Find best match: exact name and artist match
    const exactMatch = searchResults.find(
      (s) =>
        s.name.toLowerCase() === name.toLowerCase() &&
        s.artist.toLowerCase() === artist.toLowerCase(),
    );

    const selectedResult = exactMatch || searchResults[0];
    console.log(
      `[Music] Selected: "${selectedResult.name}" - "${selectedResult.artist}", ID: "${selectedResult.id}"`,
    );

    // Use the found song ID to get full details
    try {
      const detail = await getMusicDetailWithResources(
        server,
        selectedResult.id,
      );
      console.log(`[Music] Got details for song ID: ${selectedResult.id}`);
      return detail;
    } catch (error) {
      console.error(
        `[Music] Failed to get details for ID "${selectedResult.id}":`,
        error.message,
      );
      return null;
    }
  } catch (error) {
    console.error(`[Music] Error getting song detail by name/artist:`, error);
    return null;
  }
}

export async function getLyrics(
  server: ServerType,
  songId: string,
): Promise<string> {
  if (server === 'qq') {
    // 优先使用QQ音乐API获取歌词
    try {
      return await getQQMusicLyrics(songId);
    } catch (error) {
      console.error('QQ Music API failed:', error);
      // QQ音乐API失败，返回空字符串
      return '';
    }
  }

  try {
    const lyrics = await fetchMetingAPI(server, 'lrc', songId, true);
    // Ensure we return a string
    if (typeof lyrics !== 'string') {
      console.warn(`[Music] getLyrics returned non-string: ${typeof lyrics}`);
      return '';
    }
    return lyrics;
  } catch (error) {
    console.error(`[Music] Error fetching lyrics for ID ${songId}:`, error);
    return '';
  }
}

export async function getAudioUrl(
  server: ServerType,
  songId: string,
): Promise<string> {
  if (server === 'qq') {
    // 优先使用QQ音乐API获取音频URL
    try {
      return await getQQMusicAudioUrl(songId);
    } catch (error) {
      console.error('QQ Music API failed:', error);
      // QQ音乐API失败，返回空字符串
      return '';
    }
  }

  return await fetchMetingAPI(server, 'url', songId, true);
}

export async function getPictureUrl(
  server: ServerType,
  picId: string,
): Promise<string> {
  if (server === 'qq') {
    // 优先使用QQ音乐API获取图片URL
    try {
      return await getQQMusicPictureUrl(picId);
    } catch (error) {
      console.error('QQ Music API failed:', error);
      // QQ音乐API失败，返回空字符串
      return '';
    }
  }

  return await fetchMetingAPI(server, 'pic', picId, true);
}

export async function getMusicResources(
  server: ServerType,
  songId: string,
  picId?: string,
): Promise<MusicResources> {
  const [audioUrl, lyrics, pictureUrl] = await Promise.all([
    getAudioUrl(server, songId),
    getLyrics(server, songId),
    picId ? getPictureUrl(server, picId) : Promise.resolve(''),
  ]);

  return {
    audioUrl,
    lyrics,
    pictureUrl,
  };
}

export async function getMusicDetailWithResources(
  server: ServerType,
  songId: string,
): Promise<MusicDetail & MusicResources> {
  const songs = await getSongDetail(server, songId);
  if (songs.length === 0) {
    throw new Error(`No song found with ID ${songId} on ${server}`);
  }

  const song = songs[0];

  const resources = await getMusicResources(server, songId, song.pic_id);

  return {
    id: song.id,
    title: song.name,
    author: song.artist,
    url: resources.audioUrl,
    pic: resources.pictureUrl,
    lrc: resources.lyrics,
    audioUrl: resources.audioUrl,
    lyrics: resources.lyrics,
    pictureUrl: resources.pictureUrl,
  };
}

export async function getSongLikes(
  server: ServerType,
  songId: string,
  numericId?: number,
): Promise<SongLikes> {
  if (server === 'qq') {
    // 使用QQ音乐API获取点赞数
    return await getQQMusicLikes(songId, numericId);
  }

  // 网易云音乐获取点赞数逻辑保持不变
  const header = {
    clientSign:
      'BC:FC:E7:8B:4C:07@@@ZTC82T0AB251120L4C@@@@@@bbf7187108ff4025bbf98daddd476bca2b700b25f7d220e7a96811b59382e740',
    os: 'pc',
    appver: '3.1.25.204860',
    deviceId: '3BA3DFCFE05873F6C16DE3AA99FAC8C4DB1B44520250B239359C',
    requestId: 0,
    osver: 'Microsoft-Windows-11-Professional-build-26200-64bit',
  };

  const data = {
    songId,
    e_r: true,
    header: JSON.stringify(header),
  };

  const encrypted = eapiEncrypt('/api/song/red/count', JSON.stringify(data));
  const cookieHeader = getNeteaseCookieHeader();

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36 Chrome/91.0.4472.164 NeteaseMusicDesktop/3.1.25.204860',
    Accept: '*/*',
    'mconfig-info': JSON.stringify({
      IuRPVVmc3WWul9fT: { version: 894976, appver: '3.1.25.204860' },
    }),
  };

  if (cookieHeader) {
    headers['Cookie'] = cookieHeader;
  }

  const response = await fetch(NETEASE_LIKE_API, {
    method: 'POST',
    headers,
    body: `params=${encrypted}`,
  });

  if (!response.ok) {
    throw new Error(`Netease API error: HTTP ${response.status}`);
  }

  const buffer = await response.arrayBuffer();

  if (buffer.byteLength === 0) {
    throw new Error('Netease API returned empty response');
  }

  let result;
  try {
    result = dataDecrypt(Buffer.from(buffer));
  } catch (error) {
    console.error('Failed to decrypt response:');
    console.error('Response hex:', Buffer.from(buffer).toString('hex'));
    throw new Error(
      `Failed to decrypt response: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (result.code !== 200) {
    throw new Error(`Netease API error: ${result.message || 'Unknown error'}`);
  }

  return {
    count: result.data.count,
  };
}

export async function getSongDetailInfo(
  server: ServerType,
  songId: string,
): Promise<SongDetailInfo> {
  if (server === 'qq') {
    // 优先使用QQ音乐API获取详细信息
    return await getQQMusicDetailInfo(songId);
  }

  // 网易云音乐获取详细信息逻辑保持不变
  // 首先尝试使用不依赖_sign的API获取基本信息
  try {
    const basicResponse = await fetch(
      `https://music.163.com/api/song/detail?id=${songId}&ids=%5B${songId}%5D`,
      {
        method: 'GET',
        headers: {
          Cookie: getNeteaseCookieHeader(),
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      },
    );

    if (basicResponse.ok) {
      const basicResult = await basicResponse.json();
      if (
        basicResult.code === 200 &&
        basicResult.songs &&
        basicResult.songs.length > 0
      ) {
        const song = basicResult.songs[0];
        const basicInfo: SongDetailInfo = {};

        // 从专辑的publishTime中提取发行时间
        if (song.album?.publishTime) {
          basicInfo.date = new Date(song.album.publishTime)
            .toISOString()
            .split('T')[0];
        }

        // 然后尝试使用wiki API获取更详细的信息（如语言、标签、BPM）
        try {
          const header = {
            clientSign:
              'BC:FC:E7:8B:4C:07@@@ZTC82T0AB251120L4C@@@@@@bbf7187108ff4025bbf98daddd476bca2b700b25f7d220e7a96811b59382e740',
            os: 'pc',
            appver: '3.1.25.204860',
            deviceId: '3BA3DFCFE05873F6C16DE3AA99FAC8C4DB1B44520250B239359C',
            requestId: 0,
            osver: 'Microsoft-Windows-11-Professional-build-26200-64bit',
          };

          const data = {
            songId,
            _scver: '1',
            _sign: 'a03289cc15f557cac97465f76efa7839',
            e_r: true,
            header: JSON.stringify(header),
          };

          const encrypted = eapiEncrypt(
            '/api/music/wiki/home/song/desktop/get',
            JSON.stringify(data),
          );
          const cookieHeader = getNeteaseCookieHeader();

          const headers: Record<string, string> = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36 Chrome/91.0.4472.164 NeteaseMusicDesktop/3.1.25.204860',
            Accept: '*/*',
            'mconfig-info': JSON.stringify({
              IuRPVVmc3WWul9fT: { version: 894976, appver: '3.1.25.204860' },
            }),
          };

          if (cookieHeader) {
            headers['Cookie'] = cookieHeader;
          }

          const response = await fetch(NETEASE_DETAIL_API, {
            method: 'POST',
            headers,
            body: `params=${encrypted}`,
          });

          if (response.ok) {
            const buffer = await response.arrayBuffer();

            if (buffer.byteLength > 0) {
              let result;
              try {
                result = dataDecrypt(Buffer.from(buffer));
              } catch (error) {
                console.error('Failed to decrypt response:');
                console.error(
                  'Response hex:',
                  Buffer.from(buffer).toString('hex'),
                );
                // 解密失败，返回基本信息
                return basicInfo;
              }

              if (
                result.code === 200 &&
                result.data?.wikiSubBlockBaseInfoVo?.wikiSubElementVos
              ) {
                const elements =
                  result.data.wikiSubBlockBaseInfoVo.wikiSubElementVos;
                const detailInfo: SongDetailInfo = {
                  ...basicInfo,
                };

                for (const element of elements) {
                  if (element.title === '发行时间') {
                    detailInfo.date = element.content;
                  } else if (element.title === '语种') {
                    detailInfo.language = element.content;
                  } else if (
                    element.title === '曲风' &&
                    element.wikiSubMetaVos &&
                    element.wikiSubMetaVos.length > 0
                  ) {
                    detailInfo.tags = element.wikiSubMetaVos.map(
                      (meta: any) => meta.text,
                    );
                  } else if (element.title === '发行版本') {
                    if (!detailInfo.tags) {
                      detailInfo.tags = [];
                    }
                    detailInfo.tags.push(element.content);
                  } else if (element.title === '乐器') {
                    if (!detailInfo.tags) {
                      detailInfo.tags = [];
                    }
                    detailInfo.tags.push(element.content);
                  } else if (element.title === 'BPM') {
                    detailInfo.bpm = element.content;
                  }
                }

                return detailInfo;
              }
            }
          }
        } catch (wikiError) {
          console.error('Error fetching song wiki info:', wikiError);
          // wiki API失败，返回基本信息
        }

        return basicInfo;
      }
    }
  } catch (basicError) {
    console.error('Error fetching basic song info:', basicError);
  }

  return {};
}

// 优先使用QQ音乐API，失败后回退到网易云API
export async function getMusicDetailWithLikesPriority(
  songId: string,
): Promise<MusicDetailWithFullInfo> {
  // 首先尝试QQ音乐
  try {
    console.log(`尝试使用QQ音乐API获取歌曲 ${songId} 详情...`);
    const result = await getMusicDetailWithLikes('qq', songId);
    console.log(`成功使用QQ音乐API获取歌曲 ${songId} 详情`);
    return result;
  } catch (qqError) {
    console.error(`QQ音乐API获取失败，回退到网易云API: ${qqError.message}`);
    // QQ音乐失败，回退到网易云
    try {
      console.log(`尝试使用网易云API获取歌曲 ${songId} 详情...`);
      const result = await getMusicDetailWithLikes('netease', songId);
      console.log(`成功使用网易云API获取歌曲 ${songId} 详情`);
      return result;
    } catch (neteaseError) {
      console.error(`网易云API获取也失败: ${neteaseError.message}`);
      throw new Error(
        `所有音乐平台API获取失败: QQ音乐错误=${qqError.message}, 网易云错误=${neteaseError.message}`,
      );
    }
  }
}

export async function getMusicDetailWithLikes(
  server: ServerType,
  songId: string,
): Promise<MusicDetailWithFullInfo> {
  const [detail, likes, detailInfo] = await Promise.all([
    getMusicDetailWithResources(server, songId),
    getSongLikes(server, songId),
    getSongDetailInfo(server, songId),
  ]);

  return {
    id: detail.id,
    title: detail.title,
    author: detail.author,
    url: detail.url,
    pic: detail.pic,
    lrc: detail.lrc,
    audioUrl: detail.audioUrl,
    lyrics: detail.lyrics,
    pictureUrl: detail.pictureUrl,
    detail: {
      ...detailInfo,
      count: likes.count,
    },
  };
}

// 搜索歌曲
export async function searchSongs(
  keyword: string,
  server: ServerType,
): Promise<SongInfo[]> {
  try {
    if (server === 'qq') {
      // QQ Music search not implemented via this endpoint
      console.warn('QQ Music search not supported via searchSongs');
      return [];
    }

    const url = new URL(METING_API_BASE);
    url.searchParams.append('server', server);
    url.searchParams.append('type', 'search');
    url.searchParams.append('id', keyword);

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Search API error: HTTP ${response.status}`);
    }

    const data = await response.json();
    // Log raw response to see all fields
    if (data && data.length > 0) {
      console.log(
        '[Search] Raw API response (first item):',
        JSON.stringify(data[0], null, 2),
      );
    }

    // Meting API search returns complete song objects with url, pic, lrc URLs
    // Extract the real song ID from the URL parameter
    return data.map((item: any, index: number) => {
      // Extract ID from url parameter (e.g., "...id=2149887904&...")
      let id = '';
      if (item.url) {
        const urlMatch = item.url.match(/[?&]id=([^&]+)/);
        id = urlMatch ? urlMatch[1] : '';
      }

      // Fallback to other possible ID fields or create synthetic ID
      if (!id) {
        id =
          item.id ||
          item.mid ||
          item.songId ||
          item.songmid ||
          `${item.title || item.name}__${item.author}`;
      }

      console.log(
        `[Search] Item ${index}: id="${id}", name="${item.title || item.name}", artist="${item.author}"`,
      );

      return {
        id: String(id),
        name: item.title || item.name || '',
        artist: item.author || '',
        album: item.album || '',
        pic_id: item.pic_id || '',
        pictureUrl: item.pic || undefined,
      };
    });
  } catch (error) {
    console.error('Error searching songs:', error);
    return [];
  }
}
