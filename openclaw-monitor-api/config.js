import os from 'os';
import path from 'path';

export const OPENCLAW_HOME = path.join(os.homedir(), '.openclaw');
export const AGENT_NAMES = ['richard', 'jared', 'erlich', 'gilfoyle', 'monica', 'bighead', 'dinesh'];
export const TRADING_LOG = path.join(OPENCLAW_HOME, 'bighead/strategy1_v2_squeeze.log');
export const TRADING_CSV = path.join(OPENCLAW_HOME, 'bighead/strategy1_v2_squeeze_trades.csv');
export const CRON_JOBS_FILE = path.join(OPENCLAW_HOME, 'cron/jobs.json');
export const CRON_RUNS_DIR = path.join(OPENCLAW_HOME, 'cron/runs');
export const PORT = 3001;
