import { open, stat } from 'fs/promises';
import { parse } from 'csv-parse/sync';

/**
 * Read and parse a JSON file.
 * @param {string} filePath
 * @returns {Promise<object|null>} Parsed object, or null on any error
 */
export async function readJsonFile(filePath) {
  try {
    const fh = await open(filePath, 'r');
    const content = await fh.readFile({ encoding: 'utf8' });
    await fh.close();
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Read a JSONL file and return the last N parsed lines.
 * @param {string} filePath
 * @param {number} lastNLines
 * @returns {Promise<object[]>} Array of parsed objects (empty on error)
 */
export async function readJsonlFile(filePath, lastNLines = 10) {
  try {
    const fh = await open(filePath, 'r');
    const content = await fh.readFile({ encoding: 'utf8' });
    await fh.close();

    const lines = content.split('\n').filter(l => l.trim());
    const slice = lines.slice(-lastNLines);

    const results = [];
    for (const line of slice) {
      try {
        results.push(JSON.parse(line));
      } catch {
        // Skip malformed lines
      }
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Parse a CSV file using csv-parse with column headers.
 * @param {string} filePath
 * @returns {Promise<object[]>} Array of row objects (empty on error)
 */
export async function readCsvFile(filePath) {
  try {
    const fh = await open(filePath, 'r');
    const content = await fh.readFile({ encoding: 'utf8' });
    await fh.close();

    return parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch {
    return [];
  }
}

/**
 * Read the last N lines of a log file by seeking from the end.
 * Efficient for large files — does not read the entire file.
 * @param {string} filePath
 * @param {number} lastNLines
 * @returns {Promise<string[]>} Array of line strings (empty on error)
 */
export async function tailLogFile(filePath, lastNLines = 50) {
  const CHUNK_SIZE = 8192; // 8 KB per read

  try {
    const fileStat = await stat(filePath);
    const fileSize = fileStat.size;
    if (fileSize === 0) return [];

    const fh = await open(filePath, 'r');
    try {
      let buffer = Buffer.alloc(0);
      let position = fileSize;
      let linesFound = 0;

      while (position > 0 && linesFound <= lastNLines) {
        const readSize = Math.min(CHUNK_SIZE, position);
        position -= readSize;

        const chunk = Buffer.alloc(readSize);
        await fh.read(chunk, 0, readSize, position);

        buffer = Buffer.concat([chunk, buffer]);

        // Count newlines in what we have so far
        linesFound = 0;
        for (let i = 0; i < buffer.length; i++) {
          if (buffer[i] === 0x0a) linesFound++; // 0x0a = '\n'
        }
      }

      const text = buffer.toString('utf8');
      const lines = text.split('\n').filter(l => l.trim());
      return lines.slice(-lastNLines);
    } finally {
      await fh.close();
    }
  } catch {
    return [];
  }
}
