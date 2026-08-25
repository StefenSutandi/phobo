import fs from 'fs';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'payments.json');

export function getPayments() {
  if (!fs.existsSync(dbPath)) return [];
  const data = fs.readFileSync(dbPath, 'utf8');
  return JSON.parse(data);
}

export function savePayments(payments: any[]) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(dbPath, JSON.stringify(payments, null, 2));
}