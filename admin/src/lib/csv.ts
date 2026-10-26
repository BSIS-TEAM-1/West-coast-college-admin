/**
 * Minimal CSV helpers shared by the registrar import/export flows.
 *
 * The parser understands quoted fields, escaped quotes ("") and CRLF/LF line
 * endings, which is what spreadsheet apps emit when exporting to CSV.
 */

export function escapeCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function buildCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')
}

export function downloadCsv(filename: string, rows: unknown[][]): void {
  // Excel needs the BOM to read the file as UTF-8 (names with ñ, é, …).
  const blob = new Blob(['\uFEFF' + buildCsv(rows)], { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.URL.revokeObjectURL(url)
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  const pushRow = () => {
    row.push(field)
    field = ''
    // Ignore trailing blank lines but keep rows that intentionally have cells.
    if (row.some((cell) => cell.trim() !== '')) rows.push(row)
    row = []
  }

  const source = String(text ?? '').replace(/^\uFEFF/, '')

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]

    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      pushRow()
    } else if (char === '\r') {
      if (source[index + 1] === '\n') index += 1
      pushRow()
    } else {
      field += char
    }
  }

  if (field !== '' || row.length > 0) pushRow()
  return rows
}
