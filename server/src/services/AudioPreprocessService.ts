import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export class AudioPreprocessService {
  async transcodeToPcmWav(inputPath: string, outputPath: string): Promise<void> {
    const ffmpegPath = 'C:\\ffmpeg-7.1.1-full_build\\bin\\ffmpeg.exe';
    const command = `"${ffmpegPath}" -y -i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${outputPath}"`;

    try {
      await execAsync(command);
    } catch {
      await execAsync(`ffmpeg -y -i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${outputPath}"`);
    }

    await fs.access(outputPath);
  }

  inferExtension(mimeType: string | undefined, originalName: string | undefined): string {
    const fromName = originalName ? path.extname(originalName) : '';
    if (fromName) {
      return fromName.toLowerCase();
    }

    if (!mimeType) {
      return '.bin';
    }

    if (mimeType.includes('webm')) return '.webm';
    if (mimeType.includes('ogg')) return '.ogg';
    if (mimeType.includes('wav')) return '.wav';
    if (mimeType.includes('mpeg')) return '.mp3';
    if (mimeType.includes('mp4')) return '.m4a';
    return '.bin';
  }
}

export const audioPreprocessService = new AudioPreprocessService();
