const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.xlsx', '.csv']);
const FORMULA_PREFIX = /^[=+\-@]/;

interface BatchField {
  key: string;
  label?: string;
  required?: boolean;
  sensitive?: boolean;
}

interface NormalizedBatchField {
  key: string;
  label: string;
  required: boolean;
  sensitive: boolean;
}

interface BatchImportError {
  rowNumber: number;
  message: string;
}

interface BatchImportRow {
  itemId: string;
  input: Record<string, string>;
  preview: Record<string, string>;
  accountLabelMasked: string;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_');
}

function cellValue(cell: import('exceljs').Cell | undefined): string {
  const value = cell?.value;
  if (value && typeof value === 'object' && 'formula' in value && value.formula) {
    throw Object.assign(new Error('导入文件不能包含公式单元格'), { code: 'BATCH_FORMULA_REJECTED' });
  }
  if (value && typeof value === 'object' && 'text' in value) return String(value.text).trim();
  if (value instanceof Date) return value.toISOString();
  const text = String(value ?? '').trim();
  if (FORMULA_PREFIX.test(text)) {
    throw Object.assign(new Error('导入内容不能以公式符号开头'), { code: 'BATCH_FORMULA_REJECTED' });
  }
  return text;
}

function maskLabel(value: unknown): string {
  const text = String(value || '').trim();
  if (text.includes('@')) {
    const [local = '', domain = ''] = text.split('@');
    return `${local.slice(0, 2)}***@${domain}`;
  }
  return text.length > 6 ? `${text.slice(0, 2)}***${text.slice(-2)}` : text;
}

async function loadWorkbook(filePath: string): Promise<import('exceljs').Worksheet> {
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_FILE_SIZE) throw Object.assign(new Error('导入文件不能超过 10MB'), { code: 'BATCH_FILE_TOO_LARGE' });
  const extension = path.extname(filePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw Object.assign(new Error('仅支持 .xlsx 或 .csv 文件'), { code: 'BATCH_FILE_TYPE_INVALID' });
  }
  const workbook = new ExcelJS.Workbook();
  if (extension === '.csv') await workbook.csv.readFile(filePath);
  else await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets.find((sheet: import('exceljs').Worksheet) => sheet.state === 'visible') || workbook.worksheets[0];
  if (!worksheet) throw Object.assign(new Error('导入文件没有可读取的工作表'), { code: 'BATCH_SHEET_MISSING' });
  return worksheet;
}

async function parseBatchFile(filePath: string, schema: BatchField[] = [], maxRows = 50) {
  const worksheet = await loadWorkbook(filePath);
  const fields: NormalizedBatchField[] = (schema || []).map((field) => ({
    key: String(field.key || '').trim(),
    label: String(field.label || field.key || '').trim(),
    required: Boolean(field.required),
    sensitive: Boolean(field.sensitive),
  })).filter(field => field.key && !/password|passwd|pwd|secret|token|cookie/i.test(field.key));
  if (!fields.some(field => field.key === 'account_label')) {
    fields.unshift({ key: 'account_label', label: '客户简称', required: true, sensitive: false });
  }

  const headerRow = worksheet.getRow(1);
  const headers = new Map<string, number>();
  headerRow.eachCell((cell: import('exceljs').Cell, columnNumber: number) => headers.set(normalizeHeader(cell.text || cell.value), columnNumber));
  const fieldColumns = new Map<string, number>();
  for (const field of fields) {
    const column = headers.get(normalizeHeader(field.key)) || headers.get(normalizeHeader(field.label));
    if (column) fieldColumns.set(field.key, column);
  }
  const missingHeaders = fields.filter(field => field.required && !fieldColumns.has(field.key));
  if (missingHeaders.length) {
    throw Object.assign(new Error(`缺少必填列：${missingHeaders.map(item => item.label).join('、')}`), { code: 'BATCH_HEADERS_MISSING' });
  }

  const rows: BatchImportRow[] = [];
  const errors: BatchImportError[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    if (!row.hasValues) continue;
    if (rows.length >= maxRows) {
      errors.push({ rowNumber, message: `超过当前授权的 ${maxRows} 行限制` });
      continue;
    }
    try {
      const input: Record<string, string> = {};
      const rowErrors: string[] = [];
      for (const field of fields) {
        const column = fieldColumns.get(field.key);
        const value = column ? cellValue(row.getCell(column)) : '';
        input[field.key] = value;
        if (field.required && !value) rowErrors.push(`${field.label}不能为空`);
      }
      if (rowErrors.length) {
        errors.push({ rowNumber, message: rowErrors.join('；') });
        continue;
      }
      const itemId = `item_${crypto.randomBytes(8).toString('hex')}`;
      const preview: Record<string, string> = {};
      for (const field of fields) {
        preview[field.key] = field.sensitive ? '••••••' : (input[field.key] ?? '');
      }
      preview.account_label = maskLabel(input.account_label);
      rows.push({ itemId, input, preview, accountLabelMasked: preview.account_label ?? '' });
    } catch (error) {
      errors.push({ rowNumber, message: error instanceof Error ? error.message : '无法读取该行' });
    }
  }
  if (!rows.length) throw Object.assign(new Error('没有可执行的有效数据行'), { code: 'BATCH_ROWS_EMPTY', errors });
  return {
    importId: `import_${crypto.randomBytes(8).toString('hex')}`,
    fileName: path.basename(filePath),
    rows,
    errors,
  };
}

async function writeBatchErrors(filePath: string, errors: BatchImportError[] = []) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('导入问题');
  worksheet.addRow(['行号', '问题']);
  for (const problem of errors) {
    const safeMessage = String(problem?.message || '无法读取该行').replace(/^([=+\-@])/, "'$1");
    worksheet.addRow([Number(problem?.rowNumber || 0), safeMessage]);
  }
  await workbook.csv.writeFile(filePath);
  return { filePath, count: errors.length };
}

module.exports = { parseBatchFile, writeBatchErrors, MAX_FILE_SIZE, ALLOWED_EXTENSIONS };
