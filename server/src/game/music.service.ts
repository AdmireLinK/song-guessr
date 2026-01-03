import { Injectable } from '@nestjs/common';
import {
  getMusicDetailWithResources,
  getSongDetailByNameArtist,
  searchSongs as searchMusicAPI,
  getSongDetailInfo,
  getSongLikes,
  ServerType,
  SongInfo,
} from '../utils/music';

export interface MusicDetail {
  id: string;
  title: string;
  author: string;
  url: string;
  pic: string;
  lrc: string;
}

@Injectable()
export class MusicService {
  async getSongDetail(
    songId: string,
    server: ServerType,
  ): Promise<MusicDetail | null> {
    try {
      const detail = await getMusicDetailWithResources(server, songId);
      return {
        id: detail.id,
        title: detail.title,
        author: detail.author,
        url: detail.audioUrl,
        pic: detail.pictureUrl,
        lrc: detail.lyrics,
      };
    } catch (error) {
      console.error('Error getting song detail:', error);
      return null;
    }
  }

  async getSongDetailByNameArtist(
    name: string,
    artist: string,
    server: ServerType,
  ): Promise<MusicDetail | null> {
    try {
      const detail = await getSongDetailByNameArtist(server, name, artist);
      if (!detail) {
        console.log(`[MusicService] No detail found for ${name} - ${artist}`);
        return null;
      }

      return {
        id: detail.id,
        title: detail.title,
        author: detail.author,
        url: detail.audioUrl,
        pic: detail.pictureUrl,
        lrc: detail.lyrics,
      };
    } catch (error) {
      console.error('Error getting song detail by name/artist:', error);
      return null;
    }
  }

  async searchSongs(keyword: string, server: ServerType): Promise<SongInfo[]> {
    try {
      const results = await searchMusicAPI(keyword, server);
      return results;
    } catch (error) {
      console.error('Error searching songs:', error);
      return [];
    }
  }

  async getSongDetailInfo(server: ServerType, songId: string) {
    try {
      return await getSongDetailInfo(server, songId);
    } catch (error) {
      console.error('Error getting song detail info:', error);
      return null;
    }
  }

  async getSongLikes(server: ServerType, songId: string) {
    try {
      return await getSongLikes(server, songId);
    } catch (error) {
      console.error('Error getting song likes:', error);
      return null;
    }
  }
}
