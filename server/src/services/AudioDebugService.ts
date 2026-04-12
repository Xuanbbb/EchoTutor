import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

export type DebugAudioStage = 'raw' | 'preprocessed' | 'asr-input';

interface DebugAudioFileRecord {
  path: string;
  contentType: string;
  filename: string;
}

type DebugAudioRecord = Partial<Record<DebugAudioStage, DebugAudioFileRecord>>;

export class AudioDebugService {
  private readonly baseDir = path.join(os.tmpdir(), 'echo-tutor-audio-debug');
  private readonly records = new Map<string, DebugAudioRecord>();

  createDebugId(): string {
    void this.cleanupExpired();
    const debugId = `dbg_${Date.now()}_${crypto.randomUUID()}`;
    this.records.set(debugId, {});
    return debugId;
  }

  async saveBuffer(
    debugId: string,
    stage: DebugAudioStage,
    buffer: Buffer,
    extension: string,
    contentType: string,
  ): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    const normalizedExtension = extension.startsWith('.') ? extension : `.${extension}`;
    const filename = `${stage}${normalizedExtension}`;
    const targetPath = path.join(this.baseDir, `${debugId}_${filename}`);
    await fs.writeFile(targetPath, buffer);
    this.setRecord(debugId, stage, {
      path: targetPath,
      contentType,
      filename,
    });
  }

  async saveFile(
    debugId: string,
    stage: DebugAudioStage,
    sourcePath: string,
    filename: string,
    contentType = 'audio/wav',
  ): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    const targetPath = path.join(this.baseDir, `${debugId}_${filename}`);
    await fs.copyFile(sourcePath, targetPath);
    this.setRecord(debugId, stage, {
      path: targetPath,
      contentType,
      filename,
    });
  }

  buildResponse(debugId: string) {
    const record = this.records.get(debugId);
    if (!record) {
      return null;
    }

    return {
      debugId,
      stages: {
        raw: record.raw ? this.toPublicRecord(debugId, 'raw', record.raw) : null,
        preprocessed: record.preprocessed ? this.toPublicRecord(debugId, 'preprocessed', record.preprocessed) : null,
        asrInput: record['asr-input'] ? this.toPublicRecord(debugId, 'asr-input', record['asr-input']) : null,
      },
    };
  }

  async getFile(debugId: string, stage: DebugAudioStage): Promise<DebugAudioFileRecord | null> {
    const stageRecord = this.records.get(debugId)?.[stage];
    if (!stageRecord) {
      return null;
    }

    try {
      await fs.access(stageRecord.path);
      return stageRecord;
    } catch {
      return null;
    }
  }

  private setRecord(debugId: string, stage: DebugAudioStage, record: DebugAudioFileRecord) {
    const current = this.records.get(debugId) || {};
    this.records.set(debugId, {
      ...current,
      [stage]: record,
    });
  }

  private toPublicRecord(debugId: string, stage: DebugAudioStage, record: DebugAudioFileRecord) {
    return {
      url: `/api/debug/audio/${debugId}/${stage}`,
      filename: record.filename,
      contentType: record.contentType,
    };
  }

  private async cleanupExpired(): Promise<void> {
    const expireBefore = Date.now() - 1000 * 60 * 60 * 6;
    const entries = [...this.records.entries()];

    await Promise.all(entries.map(async ([debugId, record]) => {
      const rawPath = record.raw?.path || record.preprocessed?.path || record['asr-input']?.path;
      if (!rawPath) {
        this.records.delete(debugId);
        return;
      }

      try {
        const stat = await fs.stat(rawPath);
        if (stat.mtimeMs < expireBefore) {
          await Promise.all(
            Object.values(record).map(async (item) => {
              if (item?.path) {
                await fs.unlink(item.path).catch(() => {});
              }
            }),
          );
          this.records.delete(debugId);
        }
      } catch {
        this.records.delete(debugId);
      }
    }));
  }
}

export const audioDebugService = new AudioDebugService();
