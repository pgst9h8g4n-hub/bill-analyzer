import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { ParsedRecord, Direction, SubType } from './types';

// 抖音/京东支付导出的 PDF 是带文本层的：pdfjs 能正确解出 CJK（交易对方/收付款方式），
// 数字（时间/金额/单号）直接可读。记录以"交易时间"列的日期为锚点，长值换行续片要吞掉。

let workerInit: Promise<void> | null = null;
function ensureWorker() {
  if (workerInit) return workerInit;
  // 走真 worker，避免主线程解析大 PDF 卡 UI
  GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
  workerInit = Promise.resolve();
  return workerInit;
}

// pdfjs 每个 item: { str, transform:[a,b,c,d,tx,ty], width }
interface PdfItem { str: string; x: number; y: number; }

// 把一页的文本 items 分组为视觉行（y 相近归为一行），行内按 x 升序
async function extractRows(page: any): Promise<PdfItem[]> {
  const tc = await page.getTextContent();
  const items: PdfItem[] = tc.items
    .filter((it: any) => typeof it.str === 'string' && it.str.trim() !== '')
    .map((it: any) => ({ str: it.str, x: it.transform[4], y: it.transform[5] }));
  // 按 y 降序（PDF y 轴向下增长为屏幕向下；数值大的在上）
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  return items;
}

// 把视觉项聚成行：y 差 <= 4pt 视为同一行
function groupRows(items: PdfItem[]): { y: number; cells: { x: number; str: string }[] }[] {
  const rows: { y: number; cells: { x: number; str: string }[] }[] = [];
  let curY = Infinity;
  for (const it of items) {
    if (rows.length === 0 || Math.abs(it.y - curY) <= 4) {
      const last = rows[rows.length - 1];
      if (!last) {
        const row = { y: it.y, cells: [{ x: it.x, str: it.str }] };
        rows.push(row);
        curY = it.y;
      } else {
        last.cells.push({ x: it.x, str: it.str });
        last.cells.sort((a, b) => a.x - b.x);
      }
    } else {
      rows.push({ y: it.y, cells: [{ x: it.x, str: it.str }] });
      curY = it.y;
    }
  }
  return rows;
}

// 抖音 PDF 列锚点（x 近似，来自表头）：交易时间≈31 / 收支≈145 / 金额≈212 / 收付款方式≈276 / 交易单号≈370 / 交易对方≈575 / 商家单号≈713
// 一条记录以"日期"开头（列 1）。换行续片（如 中信银行信用卡（6 → 下一行 963）/ 商家单号尾段）不属于新记录。
const DATE_CELL = /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/;

export async function parseDouyinPdf(file: File): Promise<ParsedRecord[]> {
  ensureWorker();
  const buf = await file.arrayBuffer();
  const data = new Uint8Array(buf);
  const task = getDocument({ data });
  const doc = await task.promise;

  const results: ParsedRecord[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const rows = groupRows(await extractRows(page));

      // 先按"是否含日期锚点"切记录块：每个日期行起一条新记录，吞掉它到下一个日期行之间的续片行
      interface Block { dateLine: number; extraLines: number[]; }
      const blocks: Block[] = [];
      let cur: Block | null = null;
      for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].cells;
        // 该视觉行是否含交易时间列的日期（x≈31 附近有日期字符串）。
        // 跳过表头区：含 "交易时间段/导出时间/编号" 前缀的说明行，以及列头行（该行同时含 "收/支/其他"、"金额" 等表头词）
        const hasDate = cells.some(c => c.x < 100 && DATE_CELL.test(c.str));
        const isHeader = cells.some(c => /交易时间段|导出时间|编号|收\/支\/其他|金额（元）|收\/付款方式|交易对方|商家单号|交易单号|交易类型/.test(c.str));
        if (hasDate && !isHeader) {
          if (cur) blocks.push(cur);
          cur = { dateLine: i, extraLines: [] };
        } else if (cur) {
          cur.extraLines.push(i);
        }
      }
      if (cur) blocks.push(cur);

      for (const blk of blocks) {
        const lines = [blk.dateLine, ...blk.extraLines];
        // 合并所有续片行的 cells
        const merged: { x: number; str: string }[] = [];
        for (const ln of lines) merged.push(...rows[ln].cells);
        merged.sort((a, b) => a.x - b.x);
        // 相邻 str 属于同一逻辑值时拼接（同一 x 列的续片 x 相同或接近）
        const cells = mergeCells(merged);

        const timeStr = cells.find(c => c.x < 100 && DATE_CELL.test(c.str))?.str ?? '';
        const m = timeStr.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
        if (!m) continue;
        const paid_at = `${m[1]}T${m[2]}`;

        // 收/支/其他 列（x≈127-150）
        const dirStr = (cells.find(c => c.x >= 110 && c.x < 170)?.str ?? '').trim();
        // 金额 列（x≈190-230）
        const amtStr = (cells.find(c => c.x >= 185 && c.x < 250)?.str ?? '').replace(/[¥\s]/g, '');
        const amountCents = Math.round(parseFloat(amtStr) * 100);
        if (!Number.isFinite(amountCents)) continue;

        // 收/付款方式 列（x≈250-360）
        const payMethod = (cells.find(c => c.x >= 250 && c.x < 360)?.str ?? '').trim();
        // 交易对方 列（x≈520-640）
        const counterparty = (cells.find(c => c.x >= 520 && c.x < 660)?.str ?? '').trim();
        // 商家单号 列（x≥660）：取最长的串（续片拼进来后是完整号）
        const merchantOrder = (cells.filter(c => c.x >= 660).map(c => c.str).join('')) || '';

        // 方向判定（纯函数，导出供单测）
        const cls = classifyDouyinRecord(dirStr, payMethod, counterparty);
        const { direction, subType } = cls;

        results.push({
          paid_at,
          amount_cents: Math.abs(amountCents),
          merchant: counterparty || undefined,
          remark: payMethod || undefined,
          direction,
          subType,
          source: 'douyin'
        });
      }
    }
  } finally {
    // pdfjs v6：destroy 在 loading task 上（doc 只是 transport 包装）
    await task.destroy();
  }
  return results;
}

// 把按 x 排序的 cell 流合并成逻辑列值：同列（x 相近）的相邻续片串接起来
function mergeCells(cells: { x: number; str: string }[]): { x: number; str: string }[] {
  if (cells.length === 0) return [];
  const out: { x: number; str: string }[] = [];
  for (const c of cells) {
    const last = out[out.length - 1];
    // 与上一个逻辑列同一列（x 几乎相同）→ 视为续片，拼接
    if (last && Math.abs(c.x - last.x) <= 8) {
      last.str += c.str;
    } else {
      out.push({ x: c.x, str: c.str });
    }
  }
  return out;
}

// 抖音记录方向判定（纯函数，导出供单测）。
// 入参是三列文本：收/支(dirStr)、收付款方式(payMethod)、交易对方(counterparty)。
// 分支顺序有讲究：退款/红包/还款 都是"字样"优先，最后才落消费兜底。
export function classifyDouyinRecord(
  dirStr: string,
  payMethod: string,
  counterparty: string
): { direction: Direction; subType: SubType } {
  const text = [dirStr, payMethod, counterparty].join(' ');
  if (/退款/.test(text)) {
    // 退款：中性（冲减消费，单列黄色），不算收入
    return { direction: 'neutral', subType: 'refund' };
  }
  if (/理财|基金|零钱通|余额宝/.test(text)) {
    // 理财/基金/零钱通 收益到账 → 收入。放在"收入"前，避免被 dirStr 的"收入"截走误判成转账
    return { direction: 'income', subType: 'fund_return' };
  }
  if (/收入|红包/.test(dirStr)) {
    // 收到红包/转账收入
    return { direction: 'income', subType: /红包/.test(dirStr + text) ? 'redpacket' : 'transfer' };
  }
  if (/还款/.test(text)) {
    // 真·还款（信用卡/花呗/借呗 还款；"还款" 常出现在 收/支 或 交易对方）→ 中性
    // 注意：抖音月付/XX银行 是"支付方式"不含"还款"字，不会被误判
    return { direction: 'neutral', subType: 'repay' };
  }
  // 默认按 支出（抖音电商/抖音生活服务 是消费；"抖音月付"/"XX银行" 只是支付方式，不触发上面任何分支）
  return { direction: 'expense', subType: 'consumption' };
}

