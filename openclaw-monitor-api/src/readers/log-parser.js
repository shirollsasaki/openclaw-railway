// Regex patterns ported from:
//   monitor_all_bots.py  lines 80–105
//   discord_bot_updates.py lines 49–69

const RE_TIMESTAMP  = /\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/;
const RE_EQUITY     = /Equity: \$(\d+\.\d+)/;
const RE_UNREALIZED = /Unrealized: \$([+-]?\d+\.\d+)/;
const RE_REALIZED   = /Realized: \$([+-]?\d+\.\d+)/;
const RE_TOTAL      = /Total: \$(\d+\.\d+)/;
const RE_OPEN       = /Open: (\d+)/;
const RE_LONG_SHORT = /\(L:(\d+)\/S:(\d+)\)/;
const RE_LOSSES     = /Losses: (\d+)/;

/**
 * Parse an equity status line from the trading log.
 *
 * Expected format:
 * [2026-02-22 20:45:00] [INFO] Equity: $61.70 | Unrealized: $+0.00 (+0.00%) | Total: $61.70 (+2.84%) | Open: 0 (L:0/S:0) | Realized: $+1.70 | Losses: 0
 *
 * @param {string} line
 * @returns {{ equity, unrealized, total, openPositions, long, short, realized, losses, timestamp }|null}
 */
export function parseEquityLine(line) {
  if (!RE_EQUITY.test(line)) return null;

  const equityMatch     = line.match(RE_EQUITY);
  const unrealizedMatch = line.match(RE_UNREALIZED);
  const realizedMatch   = line.match(RE_REALIZED);
  const totalMatch      = line.match(RE_TOTAL);
  const openMatch       = line.match(RE_OPEN);
  const lsMatch         = line.match(RE_LONG_SHORT);
  const tsMatch         = line.match(RE_TIMESTAMP);
  const lossesMatch     = line.match(RE_LOSSES);

  return {
    timestamp:     tsMatch      ? tsMatch[1]              : null,
    equity:        equityMatch  ? parseFloat(equityMatch[1])     : null,
    unrealized:    unrealizedMatch ? parseFloat(unrealizedMatch[1]) : null,
    realized:      realizedMatch   ? parseFloat(realizedMatch[1])   : null,
    total:         totalMatch   ? parseFloat(totalMatch[1])      : null,
    openPositions: openMatch    ? parseInt(openMatch[1], 10)     : null,
    long:          lsMatch      ? parseInt(lsMatch[1], 10)       : null,
    short:         lsMatch      ? parseInt(lsMatch[2], 10)       : null,
    losses:        lossesMatch  ? parseInt(lossesMatch[1], 10)   : null,
  };
}

/**
 * Parse an OPENED / CLOSED trade line.
 *
 * Examples:
 *   [TRADE] OPENED LONG ARB @ $0.1050 | SL: $0.1035 | TP: $0.1080
 *   [TRADE] ✅ CLOSED LONG ARB @ $0.1080 | TP | P&L: +$0.85
 *   [TRADE] ❌ CLOSED SHORT ETH @ $2800 | SL | P&L: -$0.50
 *
 * @param {string} line
 * @returns {{ type, direction, asset, exitType }|null}
 */
export function parseTradeLine(line) {
  const opened = line.includes('OPENED LONG') || line.includes('OPENED SHORT');
  const closed = line.includes('CLOSED LONG') || line.includes('CLOSED SHORT');
  if (!opened && !closed) return null;

  const type      = opened ? 'OPEN' : 'CLOSE';
  const direction = line.includes('LONG') ? 'LONG' : 'SHORT';

  // Asset: word after OPENED/CLOSED LONG|SHORT
  const assetMatch = line.match(/(?:OPENED|CLOSED) (?:LONG|SHORT) ([A-Z]+)/);
  const asset = assetMatch ? assetMatch[1] : null;

  // Exit type (only meaningful for closed trades)
  let exitType = null;
  if (closed) {
    if (line.includes('TP')) exitType = 'TP';
    else if (line.includes('SL')) exitType = 'SL';
  }

  return { type, direction, asset, exitType };
}

/**
 * Parse open position table from an array of log lines.
 * Looks for lines that contain an asset name alongside LONG or SHORT
 * (the tabular position block the bot prints between the separator lines).
 *
 * @param {string[]} lines
 * @returns {{ asset: string, side: string, unrealized: number|null }[]}
 */
export function parsePositionTable(lines) {
  const positions = [];

  for (const line of lines) {
    // Match lines like: "  ARB   LONG   $0.094   ..."  or "ARB | LONG | ..."
    const match = line.match(/\b(ARB|OP|ETH|BTC|SOL|AVAX|LINK|UNI)\b.+?\b(LONG|SHORT)\b/i);
    if (!match) continue;

    const asset = match[1].toUpperCase();
    const side  = match[2].toUpperCase();

    // Best-effort unrealized P&L from same line
    const unrMatch = line.match(/([+-]?\$[\d.]+)/);
    let unrealized = null;
    if (unrMatch) {
      unrealized = parseFloat(unrMatch[1].replace('$', ''));
    }

    positions.push({ asset, side, unrealized });
  }

  return positions;
}


/**
 * Search an array of log lines from the end and return the most recent
 * equity object, or null if none found.
 *
 * @param {string[]} lines - Array of raw log lines
 * @returns {{ equity, unrealized, total, openPositions, long, short, realized, losses, timestamp }|null}
 */
export function parseLatestEquity(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    const result = parseEquityLine(lines[i]);
    if (result !== null) return result;
  }
  return null;
}