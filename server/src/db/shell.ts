// Interactive SQL shell over data/edara.db — `npm run db` (add -- --readonly to discard writes).
//
// There is no sqlite3 CLI here, so this runs on sql.js, the same engine the app uses. sql.js
// keeps the whole database in memory and rewrites the entire file on save, which means the
// running dev server holds its own copy and will overwrite anything written here the next time
// it saves. The shell still writes — it just says so up front, since the fix is to stop the
// server rather than to block the edit.
import 'dotenv/config';
import initSqlJs from 'sql.js';
import fs from 'fs';
import net from 'net';
import path from 'path';
import readline from 'readline';

const DB_PATH = path.resolve('data', 'edara.db');
const SERVER_PORT = Number(process.env.PORT) || 3000;
const MAX_CELL = 60;

const readOnly = process.argv.includes('--readonly');

// The dev server holds its own in-memory copy, so a write here would be silently clobbered.
function serverIsRunning(): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.connect({ port: SERVER_PORT, host: '127.0.0.1' });
    const done = (running: boolean) => {
      socket.destroy();
      resolve(running);
    };
    socket.setTimeout(400);
    socket.on('connect', () => done(true));
    socket.on('error', () => done(false));
    socket.on('timeout', () => done(false));
  });
}

type Mode = 'table' | 'line';
let mode: Mode = 'table';

const truncate = (v: unknown): string => {
  if (v == null) return 'NULL';
  if (v instanceof Uint8Array) return `<blob ${v.length} bytes>`;
  const s = String(v).replace(/\s+/g, ' ');
  return s.length > MAX_CELL ? `${s.slice(0, MAX_CELL - 1)}…` : s;
};

function printTable(columns: string[], values: any[][]): void {
  const cells = values.map(row => row.map(truncate));
  const widths = columns.map((c, i) =>
    Math.max(c.length, ...cells.map(r => r[i].length), 1)
  );
  const line = (parts: string[]) => parts.map((p, i) => p.padEnd(widths[i])).join('  ');
  console.log(line(columns));
  console.log(widths.map(w => '─'.repeat(w)).join('  '));
  for (const row of cells) console.log(line(row));
}

function printLines(columns: string[], values: any[][]): void {
  const pad = Math.max(...columns.map(c => c.length));
  values.forEach((row, i) => {
    if (i > 0) console.log('');
    columns.forEach((c, j) => console.log(`${c.padEnd(pad)} = ${truncate(row[j])}`));
  });
}

async function main(): Promise<void> {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`لا توجد قاعدة بيانات على المسار ${DB_PATH} — شغّل الخادم مرة واحدة أولاً.`);
    process.exit(1);
  }

  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(DB_PATH));

  const canPersist = !readOnly;
  const serverUp = canPersist && (await serverIsRunning());

  console.log(`edara sqlite shell — ${DB_PATH}`);
  console.log(
    canPersist
      ? 'وضع القراءة والكتابة — التغييرات تُحفظ في الملف. للقراءة فقط: npm run db -- --readonly'
      : 'وضع القراءة فقط — أي تعديل يبقى في الذاكرة ويُهمل عند الخروج.'
  );
  if (serverUp) {
    console.log(
      `\x1b[33m!\x1b[0m الخادم يعمل على المنفذ ${SERVER_PORT} ويقرأ الملف مرة واحدة عند بدئه فقط، ` +
      'فلن يرى تعديلاتك وسيستبدلها عند أول حفظ منه. أعد تشغيله بعد كل تعديل من هنا.'
    );
  }
  console.log('اكتب .help للأوامر، و .quit للخروج. أنهِ كل جملة بفاصلة منقوطة ;\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'sql> ' });
  let buffer = '';

  // Every statement is its own transaction — sql.js runs in autocommit and the file is written
  // straight after, so BEGIN/COMMIT are neither needed nor available.
  const isRead = (sql: string) => /^\s*(select|pragma|explain|with)\b/i.test(sql);

  const run = (sql: string): void => {
    try {
      const results = db.exec(sql);
      if (!results.length) {
        if (isRead(sql)) {
          console.log('(٠ صف)');
        } else {
          const changed = db.getRowsModified();
          console.log(changed > 0 ? `تم — ${changed} صف` : 'تم');
          if (serverUp) {
            console.log('\x1b[33m  أعد تشغيل الخادم ليرى هذا التغيير.\x1b[0m');
          }
        }
      } else {
        for (const r of results) {
          if (mode === 'line') printLines(r.columns, r.values);
          else printTable(r.columns, r.values);
          console.log(`(${r.values.length} صف)`);
        }
      }
      if (canPersist) fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
    } catch (err: any) {
      console.error(`\x1b[31mخطأ:\x1b[0m ${err.message}`);
    }
  };

  const dot = (input: string): boolean => {
    const [cmd, arg] = input.trim().split(/\s+/, 2);
    switch (cmd) {
      case '.help':
        console.log([
          '.tables            أسماء الجداول',
          '.schema [جدول]     تعريف الجداول',
          '.count [نمط]       عدد الصفوف في كل جدول',
          '.mode table|line   شكل عرض النتائج',
          '.quit              خروج',
        ].join('\n'));
        return true;
      case '.tables':
        run("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;");
        return true;
      case '.schema':
        run(
          "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL" +
          (arg ? ` AND name LIKE '%${arg.replace(/'/g, "''")}%'` : '') +
          ' ORDER BY name;'
        );
        return true;
      case '.count': {
        const like = arg ? `%${arg.replace(/'/g, "''")}%` : '%';
        const names = db.exec(
          `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name LIKE '${like}' ORDER BY name`
        );
        const rows = (names[0]?.values ?? []).map(([n]) => {
          const c = db.exec(`SELECT COUNT(*) FROM "${n}"`)[0].values[0][0];
          return [n, c];
        });
        printTable(['table', 'rows'], rows as any[][]);
        return true;
      }
      case '.mode':
        if (arg === 'table' || arg === 'line') { mode = arg; console.log(`mode = ${mode}`); }
        else console.error('استخدم: .mode table أو .mode line');
        return true;
      case '.quit':
      case '.exit':
        rl.close();
        return true;
      default:
        return false;
    }
  };

  rl.prompt();
  rl.on('line', input => {
    const trimmed = input.trim();
    if (!buffer && trimmed.startsWith('.')) {
      if (!dot(trimmed)) console.error(`أمر غير معروف: ${trimmed} — جرّب .help`);
      rl.prompt();
      return;
    }
    if (!trimmed && !buffer) {
      rl.prompt();
      return;
    }

    // Statements may span lines; a trailing semicolon ends one.
    buffer += `${buffer ? '\n' : ''}${input}`;
    if (!buffer.trimEnd().endsWith(';')) {
      rl.setPrompt(' ...> ');
      rl.prompt();
      return;
    }
    run(buffer);
    buffer = '';
    rl.setPrompt('sql> ');
    rl.prompt();
  });

  rl.on('close', () => {
    console.log('');
    process.exit(0);
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
