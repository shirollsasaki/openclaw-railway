import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function execOpenClawRaw(args, { timeoutMs = 60000 } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync('openclaw', args, {
      timeout: timeoutMs,
    });
    return { ok: true, stdout: stdout ?? '', stderr: stderr ?? '' };
  } catch (err) {
    return {
      ok: false,
      stdout: err?.stdout ?? '',
      stderr: err?.stderr ?? (err?.message ?? ''),
      error: err?.message ?? 'openclaw command failed',
    };
  }
}

/**
 * Run OpenClaw CLI with given args + --json flag.
 * @param {string[]} args - CLI args (e.g. ['agent', 'list'])
 * @returns {Promise<object|null>} Parsed JSON response, or null on any error
 */
export async function execOpenClawCLI(args) {
  try {
    const { stdout } = await execFileAsync('openclaw', [...args, '--json'], {
      timeout: 15000,
    });

    const trimmed = stdout.trim();
    if (!trimmed) return null;

    return JSON.parse(trimmed);
  } catch (err) {
    // Covers: command not found, timeout (ETIMEDOUT/SIGTERM), non-zero exit,
    // and JSON.parse failures (SyntaxError)
    return null;
  }
}
