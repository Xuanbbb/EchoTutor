import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

interface PronunciationResult {
  status: 'success' | 'error';
  recognized_text?: string;
  confidence_score?: number;
  token_details?: Array<{ char: string; score: number; step: number }>;
  processing_time_ms?: number;
  details?: string;
  message?: string;
}

export class ScoringService {
  private pythonScriptPath: string;

  constructor() {
    this.pythonScriptPath = path.join(process.cwd(), 'python', 'score.py');
  }

  async assessPronunciation(audioBuffer: Buffer, referenceText: string = ''): Promise<PronunciationResult> {
    const tempFilePath = path.join(os.tmpdir(), `audio_${Date.now()}.wav`);

    try {
      // 1. Write buffer to temporary file
      await fs.writeFile(tempFilePath, audioBuffer);

      // 2. Call Python script
      const result = await this.runPythonScript(tempFilePath, referenceText);
      return result;

    } catch (error) {
      console.error('ScoringService Error:', error);
      // Fallback/Error response
      return {
        status: 'error',
        message: 'Failed to run pronunciation assessment. Ensure Python environment is set up.',
        details: error instanceof Error ? error.message : String(error)
      };
    } finally {
      // 3. Cleanup: Delete temporary file
      try {
        await fs.unlink(tempFilePath);
      } catch (unlinkError) {
        console.warn('Failed to delete temp file:', unlinkError);
      }
    }
  }

  private runPythonScript(audioPath: string, text: string): Promise<PronunciationResult> {
    return new Promise((resolve, reject) => {
      // Assuming 'python' is in the PATH. You might need to configure this.
      const pythonProcess = spawn('python', [
        this.pythonScriptPath,
        '--audio', audioPath
      ]);

      let stdoutData = '';
      let stderrData = '';
      
      // Set a timeout (e.g., 2 minutes for first run model download)
      const timeoutMs = 120000;
      const timeoutTimer = setTimeout(() => {
        console.error(`[ScoringService] Python script timed out after ${timeoutMs}ms.`);
        pythonProcess.kill();
        resolve({
          status: 'error',
          message: 'Scoring service timed out. The first run might be downloading the model.',
          details: 'Check server logs for download progress.'
        });
      }, timeoutMs);

      let isResolved = false;

      const finish = (result: PronunciationResult) => {
        if (isResolved) return;
        isResolved = true;
        clearTimeout(timeoutTimer);
        resolve(result);
        // Ideally we should kill the process if we are done
        try {
            pythonProcess.kill();
        } catch (e) {
            // ignore
        }
      };

      pythonProcess.stdout.on('data', (data) => {
        const strData = data.toString();
        // debug log only length to avoid clutter if huge, or first 100 chars
        console.log(`[ScoringService] Received stdout chunk: ${strData.length} chars. Preview: ${strData.substring(0, 50)}...`);
        stdoutData += strData;

        // Try to parse early - if we have a valid JSON, we don't need to wait for 'close'
        try {
            // Check if it looks like the end of our JSON (we know our structure ends with "}")
            if (stdoutData.trim().endsWith('}')) {
                const result: PronunciationResult = JSON.parse(stdoutData);
                // Validate it has expected fields to be sure it's not a partial JSON
                if (result.status && (result.recognized_text !== undefined || result.message)) {
                     console.log('[ScoringService] Successfully parsed JSON early. Resolving.');
                     finish(result);
                }
            }
        } catch (e) {
            // Not a complete JSON yet, continue waiting
        }
      });

      // Stream stderr immediately to console for real-time debugging (download progress etc.)
      pythonProcess.stderr.on('data', (data) => {
        const msg = data.toString();
        stderrData += msg;
        process.stderr.write(`[Python Sidecar] ${msg}`);
      });

      pythonProcess.on('close', (code) => {
        if (isResolved) return; // Already handled by early exit

        clearTimeout(timeoutTimer);

        if (code !== 0) {
          console.error(`Python script exited with code ${code}`);
          // If python is not found or crashes, resolve with error status instead of rejecting
          resolve({
            status: 'error',
            message: 'Python script execution failed.',
            details: stderrData || 'Unknown error'
          });
          return;
        }

        try {
          const result: PronunciationResult = JSON.parse(stdoutData);
          resolve(result);
        } catch (parseError) {
          console.error('Failed to parse Python output:', stdoutData);
          resolve({
            status: 'error',
            message: 'Invalid output from scoring engine.',
            details: stdoutData
          });
        }
      });

      pythonProcess.on('error', (err) => {
         clearTimeout(timeoutTimer);
         console.error('Failed to spawn python process:', err);
         resolve({
            status: 'error',
            message: 'Python runtime not found or failed to start.',
            details: err.message
         });
      });
    });
  }
}
