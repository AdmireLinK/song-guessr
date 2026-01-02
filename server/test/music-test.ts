import 'dotenv/config';
import { getMusicDetailWithLikes } from '../src/utils/music';
import { ServerType } from '../src/utils/music';

function formatOutput(data: any): void {
  console.log('\n========================================');
  console.log('歌曲详细信息');
  console.log('========================================\n');

  console.log('基本信息:');
  console.log(`  ID: ${data.id}`);
  console.log(`  标题: ${data.title}`);
  console.log(`  歌手: ${data.author}`);
  console.log(`  歌曲链接: ${data.url}`);
  console.log(`  图片链接: ${data.pic}`);
  console.log(`  歌词长度: ${data.lrc.length} 字符`);

  console.log('\n资源信息:');
  console.log(`  音频URL: ${data.audioUrl}`);
  console.log(`  图片URL: ${data.pictureUrl}`);
  console.log(`  歌词预览: ${data.lyrics.substring(0, 100)}${data.lyrics.length > 100 ? '...' : ''}`);

  console.log('\n详细信息:');
  if (data.detail.date) {
    console.log(`  发行时间: ${data.detail.date}`);
  }
  if (data.detail.language) {
    console.log(`  语种: ${data.detail.language}`);
  }
  if (data.detail.tags && data.detail.tags.length > 0) {
    console.log(`  标签: ${data.detail.tags.join(', ')}`);
  }
  if (data.detail.bpm) {
    console.log(`  BPM: ${data.detail.bpm}`);
  }
  console.log(`  点赞数: ${data.detail.count} (${data.detail.countDesc})`);

  console.log('\n========================================\n');
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('用法: npx ts-node test/music-test.ts <歌曲ID>');
    console.log('示例: npx ts-node test/music-test.ts 2122534120');
    process.exit(1);
  }

  const songId = args[0];
  console.log('网易云音乐信息获取工具');
  console.log('========================================\n');
  console.log(`正在获取歌曲 ID: ${songId} 的信息...\n`);

  try {
    const server: ServerType = 'netease';
    const result = await getMusicDetailWithLikes(server, songId.trim());
    formatOutput(result);
  } catch (error) {
    console.error('获取歌曲信息时出错:');
    if (error instanceof Error) {
      console.error(`错误信息: ${error.message}`);
      console.error(`错误堆栈: ${error.stack}`);
    } else {
      console.error(String(error));
    }
    process.exit(1);
  }
}

main();
