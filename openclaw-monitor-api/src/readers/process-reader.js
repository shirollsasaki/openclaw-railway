import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Find running avantis_bot processes via `ps aux | grep avantis_bot`.
 * @returns {Promise<{ pid: number, name: string, cpu: number, mem: number }[]>}
 */
export async function getBotProcesses() {
  try {
    const { stdout } = await execAsync('ps aux | grep avantis_bot | grep -v grep');

    const lines = stdout.split('\n').filter(l => l.trim());
    const processes = [];

    for (const line of lines) {
      // ps aux columns: USER PID %CPU %MEM VSZ RSS TT STAT STARTED TIME COMMAND
      const parts = line.trim().split(/\s+/);
      if (parts.length < 11) continue;

      const pid  = parseInt(parts[1], 10);
      const cpu  = parseFloat(parts[2]);
      const mem  = parseFloat(parts[3]);

      // Build a readable name from the command portion (everything from index 10 onward)
      const command = parts.slice(10).join(' ');
      // Extract the script filename (e.g. avantis_bot.py)
      const nameMatch = command.match(/avantis_bot[\w.]*\.py/);
      const name = nameMatch ? nameMatch[0] : command.slice(0, 60);

      if (!isNaN(pid)) {
        processes.push({ pid, name, cpu, mem });
      }
    }

    return processes;
  } catch {
    // grep exits with code 1 when no matches — return empty array
    return [];
  }
}
