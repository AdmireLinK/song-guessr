import { getMusicDetailWithLikes } from '../src/utils/music';

async function testNeteaseNewAPI() {
  console.log('=== 测试网易云音乐新API ===\n');

  const testSongId = '2149887904';

  try {
    console.log(`测试歌曲ID: ${testSongId}`);
    console.log('正在调用网易云音乐新API...\n');

    const result = await getMusicDetailWithLikes('netease', testSongId);

    console.log('完整信息:');
    console.log(JSON.stringify(result, null, 2));

    if (result.detail) {
      console.log('\n详细信息:');
      if (result.detail.date) {
        console.log(`  发行日期: ${result.detail.date}`);
      }
      if (result.detail.tags && result.detail.tags.length > 0) {
        console.log(`  标签: ${result.detail.tags.join(', ')}`);
      }
      if (result.detail.language) {
        console.log(`  语言: ${result.detail.language}`);
      }
      if (result.detail.bpm) {
        console.log(`  BPM: ${result.detail.bpm}`);
      }
      if (result.detail.count !== undefined) {
        console.log(`  收藏数: ${result.detail.count}`);
      }
    }
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

testNeteaseNewAPI();
