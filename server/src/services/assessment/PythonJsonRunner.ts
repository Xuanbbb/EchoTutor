import { spawn } from 'child_process';

export class PythonJsonRunner {
  constructor(
    private readonly scriptPath: string,
    private readonly timeoutMs: number = 120000,
  ) {}

  run(args: string[]): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python', [this.scriptPath, ...args]);
      let stdoutData = '';
      let stderrData = '';

      const timeoutTimer = setTimeout(() => {
        pythonProcess.kill();
        reject(new Error(`Python script timed out after ${this.timeoutMs}ms.`));
      }, this.timeoutMs);

      pythonProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        const msg = data.toString();
        stderrData += msg;
        process.stderr.write(`[Python Sidecar] ${msg}`);
      });

      pythonProcess.on('close', (code) => {
        clearTimeout(timeoutTimer);

        if (code !== 0) {
          reject(new Error(stderrData || `Python script exited with code ${code}`));
          return;
        }

        try {
          resolve(JSON.parse(stdoutData) as Record<string, unknown>);
        } catch (error) {
          reject(new Error(`Invalid JSON output: ${stdoutData}`));
        }
      });

      pythonProcess.on('error', (error) => {
        clearTimeout(timeoutTimer);
        reject(error);
      });
    });
  }
}
