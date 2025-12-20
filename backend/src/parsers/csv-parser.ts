import fs from 'fs';
import { parse } from 'csv-parse';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

/**
 * CSV统计数据行接口
 */
export interface CsvStatsRow {
  timestamp: number;
  elapsed: number;
  callRate: number;
  currentCalls: number;
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  [key: string]: number | string;
}

/**
 * CSV解析器选项
 */
export interface CsvParserOptions {
  filePath: string;
  watchMode?: boolean; // 是否监听文件变化
  pollInterval?: number; // 轮询间隔（毫秒）
}

/**
 * SIPp CSV统计文件解析器
 * 职责：解析和监听SIPp生成的CSV统计文件
 * 遵循单一职责原则和开闭原则（可扩展不同的CSV格式）
 */
export class CsvParser extends EventEmitter {
  private filePath: string;
  private watchMode: boolean;
  private pollInterval: number;
  private watcher: fs.FSWatcher | null = null;
  private lastPosition: number = 0;
  private isWatching: boolean = false;

  constructor(options: CsvParserOptions) {
    super();
    this.filePath = options.filePath;
    this.watchMode = options.watchMode ?? true;
    this.pollInterval = options.pollInterval ?? 1000;
  }

  /**
   * 开始监听CSV文件
   */
  start(): void {
    if (this.isWatching) {
      logger.warn('CSV parser is already watching');
      return;
    }

    if (!fs.existsSync(this.filePath)) {
      logger.warn(`CSV file not found: ${this.filePath}, waiting for creation...`);
    }

    if (this.watchMode) {
      this.startWatching();
    }

    this.isWatching = true;
    logger.info(`CSV parser started for: ${this.filePath}`);
  }

  /**
   * 停止监听
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.isWatching = false;
    logger.info('CSV parser stopped');
  }

  /**
   * 启动文件监听
   */
  private startWatching(): void {
    // 使用轮询方式监听文件变化（更可靠）
    const checkFile = () => {
      if (!this.isWatching) return;

      if (fs.existsSync(this.filePath)) {
        this.readNewLines();
      }

      setTimeout(checkFile, this.pollInterval);
    };

    checkFile();
  }

  /**
   * 读取文件新增的行
   */
  private async readNewLines(): Promise<void> {
    try {
      const stats = fs.statSync(this.filePath);
      const currentSize = stats.size;

      // 文件没有新增内容
      if (currentSize <= this.lastPosition) {
        return;
      }

      // 读取新增的内容
      const stream = fs.createReadStream(this.filePath, {
        start: this.lastPosition,
        end: currentSize,
        encoding: 'utf8',
      });

      const parser = stream.pipe(
        parse({
          columns: true,
          skip_empty_lines: true,
          trim: true,
          relax_quotes: true,
        })
      );

      for await (const record of parser) {
        const row = this.parseRow(record);
        if (row) {
          this.emit('data', row);
        }
      }

      this.lastPosition = currentSize;
    } catch (error) {
      logger.error('Error reading CSV file:', error);
      this.emit('error', error);
    }
  }

  /**
   * 解析CSV行数据
   * 根据SIPp CSV格式转换字段
   */
  private parseRow(record: any): CsvStatsRow | null {
    try {
      // SIPp CSV的典型列：
      // StartTime;LastResetTime;CurrentTime;ElapsedTime;CallRate;IncomingCall;OutgoingCall;TotalCallCreated;CurrentCall;SuccessfulCall;FailedCall;...

      const row: CsvStatsRow = {
        timestamp: Date.now(),
        elapsed: this.parseNumber(record.ElapsedTime || record.elapsed),
        callRate: this.parseNumber(record.CallRate || record.call_rate),
        currentCalls: this.parseNumber(record.CurrentCall || record.current_calls),
        totalCalls: this.parseNumber(record.TotalCallCreated || record.total_calls),
        successCalls: this.parseNumber(record.SuccessfulCall || record.success_calls),
        failedCalls: this.parseNumber(record.FailedCall || record.failed_calls),
      };

      return row;
    } catch (error) {
      logger.error('Error parsing CSV row:', error);
      return null;
    }
  }

  /**
   * 解析数字字段
   */
  private parseNumber(value: any): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  /**
   * 读取整个CSV文件
   */
  async readAll(): Promise<CsvStatsRow[]> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(this.filePath)) {
        resolve([]);
        return;
      }

      const rows: CsvStatsRow[] = [];
      const stream = fs.createReadStream(this.filePath, { encoding: 'utf8' });

      const parser = stream.pipe(
        parse({
          columns: true,
          skip_empty_lines: true,
          trim: true,
          relax_quotes: true,
        })
      );

      parser.on('data', (record) => {
        const row = this.parseRow(record);
        if (row) {
          rows.push(row);
        }
      });

      parser.on('end', () => {
        resolve(rows);
      });

      parser.on('error', (error) => {
        logger.error('Error reading CSV file:', error);
        reject(error);
      });
    });
  }

  /**
   * 获取最新的统计数据
   */
  async getLatest(): Promise<CsvStatsRow | null> {
    const rows = await this.readAll();
    return rows.length > 0 ? rows[rows.length - 1] : null;
  }
}
