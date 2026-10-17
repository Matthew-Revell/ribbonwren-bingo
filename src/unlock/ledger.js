function escapeCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
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
    const [date, id, order, name] = line.split(",");
    return { date, id, order, name };
  });
}
