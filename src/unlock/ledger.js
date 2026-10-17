function neutralizeFormula(value) {
  const text = String(value ?? "");
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function escapeCell(value) {
  return `"${neutralizeFormula(value).replace(/"/g, '""')}"`;
}

function restoreFormula(value) {
  const text = String(value ?? "");
  return text.startsWith("'") && /^[=+\-@\t\r]/.test(text.slice(1)) ? text.slice(1) : text;
}

/** Split one CSV row. Fields are always quoted on the way out. */
export function parseCsvRow(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

/** Date, code id, order number, first name. No email column. */
export function ledgerCsv(rows) {
  const lines = ["date,code_id,order_number,first_name"];
  for (const row of rows) {
    lines.push([row.date, row.id, row.order, row.name].map(escapeCell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function parseLedger(csv) {
  const lines = String(csv || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const start = lines[0].toLowerCase().startsWith("date,") ? 1 : 0;
  return lines.slice(start).map((line) => {
    const [date, id, order, name] = parseCsvRow(line);
    return {
      date: restoreFormula(date),
      id: restoreFormula(id),
      order: restoreFormula(order),
      name: restoreFormula(name),
    };
  });
}
