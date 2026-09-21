'use strict';

/**
 * Certificate of Registration (COR) PDF renderer.
 *
 * Design rules that keep the document free of overlaps:
 *  - Every block is placed from a running Y cursor; nothing uses "magic" absolute
 *    positions except the footer, which is pinned to the bottom of the LAST page and
 *    is guaranteed its own reserved space (see FOOTER_HEIGHT).
 *  - Every table row and info cell is MEASURED (heightOfString) before it is drawn.
 *  - Long tables paginate automatically and repeat the header row.
 *
 * QR rules that keep the code scannable:
 *  - Drawn as vector squares (no raster scaling / blur).
 *  - Error-correction level M (much less dense than H), 80pt symbol, >= 4 module quiet zone.
 *  - Nothing else is drawn inside the quiet zone.
 */

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const DEFAULT_LOGO_PATH = path.join(__dirname, '../../public/logo-header.jpg');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INSTITUTION = {
  country: 'Republic of the Philippines',
  name: 'West Coast College',
  address: 'Pio Duran, Albay',
  college: 'Pio Duran'
};

const PAGE = {
  width: 612, // LETTER
  height: 792,
  margin: 40,
  bottom: 748 // lowest Y that content may reach (leaves room for the running footer)
};
PAGE.contentWidth = PAGE.width - PAGE.margin * 2;

const COLORS = {
  ink: '#111827',
  muted: '#6B7280',
  border: '#6B7280',
  borderLight: '#D1D5DB',
  fill: '#E5E7EB',
  accent: '#B91C1C'
};

const FONT = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold'
};

// Table column layout (must sum to PAGE.contentWidth = 532)
const TABLE_COLUMNS = [
  { key: 'code', label: 'Code', width: 48, align: 'left' },
  { key: 'title', label: 'Subject', width: 118, align: 'left' },
  { key: 'units', label: 'Units', width: 30, align: 'center' },
  { key: 'block', label: 'Class', width: 74, align: 'left' },
  { key: 'days', label: 'Days', width: 34, align: 'center' },
  { key: 'time', label: 'Time', width: 80, align: 'center' },
  { key: 'room', label: 'Room', width: 46, align: 'left' },
  { key: 'faculty', label: 'Faculty', width: 102, align: 'left' }
];

const TABLE = {
  fontSize: 7.5,
  padX: 3,
  padY: 3,
  headerHeight: 17,
  minRowHeight: 16,
  minRows: 8
};

const TOTALS_HEIGHT = 18;
const CERTIFICATION_TEXT =
  'This is to certify that the above-named student is officially registered for the semester and ' +
  'school year stated above, subject to the rules and regulations of the institution.';

// Footer (signatures + QR) is pinned to the bottom of the last page.
const FOOTER_HEIGHT = 116;
const QR = {
  size: 80, // symbol size in points (~1.1 inch)
  columnWidth: 112,
  quietZoneModules: 4
};

// ---------------------------------------------------------------------------
// Pure helpers (exported so they can be unit-tested / reused by the controller)
// ---------------------------------------------------------------------------

function cleanText(value, fallback = '') {
  const text = String(value ?? '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return text || fallback;
}

function extractProgram(value) {
  const text = cleanText(value);
  if (!text) return 'N/A';
  return text.replace(/\s*-\s*major in\s+.+$/i, '').trim() || text;
}

function extractMajor(value) {
  const text = cleanText(value);
  if (!text) return '';
  const match = text.match(/major in\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function calculateAge(birthDate, asOf = new Date()) {
  if (!birthDate) return 'N/A';
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return 'N/A';
  let age = asOf.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    asOf.getMonth() < birth.getMonth() ||
    (asOf.getMonth() === birth.getMonth() && asOf.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? String(age) : 'N/A';
}

/**
 * Formats the student number as YYYY + course code + 5-digit sequence.
 * Supports the legacy "YYYY-CODE-SEQ" and the 12-digit "YYYYCCCSSSSS" formats.
 */
function formatStudentNumber(rawStudentNumber, courseCode) {
  const parts = String(rawStudentNumber || '')
    .split('-')
    .map((part) => part.trim())
    .filter(Boolean);

  let yearPart;
  let seqPart;

  if (parts.length === 1 && /^\d{12}$/.test(parts[0])) {
    yearPart = parts[0].substring(0, 4);
    seqPart = parts[0].substring(7);
  } else {
    yearPart = /^\d{4}$/.test(parts[0] || '') ? parts[0] : '0000';
    const seqRaw = [...parts].reverse().find((part) => /^\d+$/.test(part)) || '00000';
    seqPart = seqRaw.slice(-5).padStart(5, '0');
  }

  return `${yearPart}${courseCode}${seqPart}`;
}

function formatClassBlockLabel(rawSectionCode, courseAbbreviation) {
  const sectionCode = cleanText(rawSectionCode).toUpperCase();
  const course = cleanText(courseAbbreviation).toUpperCase();
  if (!sectionCode) return '';
  if (!course) return sectionCode;

  const blockSlotMatch = sectionCode.match(/(?:^|[-\s])(\d+)-?([A-Z])$/);
  if (blockSlotMatch) return `${course}-${blockSlotMatch[1]}${blockSlotMatch[2]}`;

  const parts = sectionCode.split('-').filter(Boolean);
  const firstPart = parts[0] || '';
  if (/^\d/.test(firstPart) || parts.length <= 1) {
    const suffix = parts.length > 1 ? parts.slice(1).join('-') : sectionCode;
    return suffix ? `${course}-${suffix}` : sectionCode;
  }
  return sectionCode;
}

/**
 * Parses schedule strings such as:
 *   "M 07:30-09:00 @ Room 205 / W 13:00-14:30 @ Lab 3"
 *   "MWF07:30-09:00"   |   "TTH 13:00-14:30"
 * into one meeting object per day-group.
 */
function parseScheduleMeetings(rawSchedule) {
  const text = cleanText(rawSchedule);
  if (!text || /^tba$/i.test(text)) return [];

  return text
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const roomMatch = segment.match(/^(.+?)\s*@\s*(.+)$/);
      const body = roomMatch ? roomMatch[1].trim() : segment;
      const room = roomMatch ? roomMatch[2].trim() : '';

      const compact = body.match(/^([A-Za-z][A-Za-z,-]*)(\d{1,2}:\d{2}.*)$/);
      if (compact) return { days: compact[1].toUpperCase(), time: compact[2].trim(), room };

      const spaced = body.match(/^([A-Za-z][A-Za-z,-]*)\s+(.+)$/);
      if (spaced) return { days: spaced[1].toUpperCase(), time: spaced[2].trim(), room };

      return { days: '', time: body, room };
    });
}

/**
 * Turns an enrollment subject entry into printable table cells.
 * Multiple meetings are stacked on separate lines so Days / Time / Room line up.
 */
function buildSubjectRow(subject, classBlockLabel) {
  const meetings = parseScheduleMeetings(subject?.schedule);

  const days = meetings.length ? meetings.map((m) => m.days || 'TBA').join('\n') : 'TBA';
  const time = meetings.length ? meetings.map((m) => m.time || 'TBA').join('\n') : 'TBA';

  const explicitRoom = cleanText(subject?.room);
  let room = 'TBA';
  if (explicitRoom && !/^tba$/i.test(explicitRoom)) {
    room = explicitRoom;
  } else if (meetings.some((m) => m.room)) {
    room = meetings.map((m) => m.room || 'TBA').join('\n');
  }

  const units = Number(subject?.units);

  return {
    code: cleanText(subject?.code, '-'),
    title: cleanText(subject?.title, '-'),
    units: Number.isFinite(units) && units > 0 ? units.toFixed(1) : '-',
    block: classBlockLabel || 'N/A',
    days,
    time,
    room,
    faculty: cleanText(subject?.instructor, 'TBA')
  };
}

function toUnitValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Splits total units into lecture / lab.
 *  1. Uses explicit lectureUnits / labUnits when at least one is a positive number.
 *  2. Otherwise falls back to keyword detection (LAB, LABORATORY, PRACTICUM) in code/title.
 */
function computeUnitBreakdown(subjects) {
  return (subjects || []).reduce(
    (acc, subject) => {
      const units = toUnitValue(subject?.units) || 0;
      const lecture = toUnitValue(subject?.lectureUnits);
      const lab = toUnitValue(subject?.labUnits);

      if ((lecture || 0) + (lab || 0) > 0) {
        const lectureUnits = lecture !== null ? lecture : Math.max(units - (lab || 0), 0);
        const labUnits = lab !== null ? lab : Math.max(units - lectureUnits, 0);
        acc.lectureUnits += lectureUnits;
        acc.labUnits += labUnits;
        return acc;
      }

      const text = `${subject?.code || ''} ${subject?.title || ''}`;
      if (/(LAB|LABORATORY|PRACTICUM)/i.test(text)) acc.labUnits += units;
      else acc.lectureUnits += units;
      return acc;
    },
    { lectureUnits: 0, labUnits: 0 }
  );
}

// ---------------------------------------------------------------------------
// QR helpers
// ---------------------------------------------------------------------------

function buildQrMatrix(text) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  return { size: qr.modules.size, isDark: (row, col) => qr.modules.get(row, col) === 1 };
}

/** Draws the QR as ONE vector path (horizontal runs merged) — crisp at any zoom / print size. */
function drawQrVector(doc, matrix, x, y, size) {
  const moduleSize = size / matrix.size;
  doc.save();
  doc.fillColor('#000000');
  for (let row = 0; row < matrix.size; row += 1) {
    let col = 0;
    while (col < matrix.size) {
      if (!matrix.isDark(row, col)) {
        col += 1;
        continue;
      }
      let end = col;
      while (end + 1 < matrix.size && matrix.isDark(row, end + 1)) end += 1;
      doc.rect(x + col * moduleSize, y + row * moduleSize, (end - col + 1) * moduleSize, moduleSize);
      col = end + 1;
    }
  }
  doc.fill();
  doc.restore();
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

function setFont(doc, font, size) {
  doc.font(font).fontSize(size);
}

/** Largest font size (<= maxSize, >= minSize) at which `text` fits on one line of `width`. */
function fitFontSize(doc, text, font, maxSize, minSize, width) {
  let size = maxSize;
  doc.font(font);
  while (size > minSize) {
    doc.fontSize(size);
    if (doc.widthOfString(text) <= width) break;
    size -= 0.5;
  }
  return size;
}

function measure(doc, text, width, font, size) {
  setFont(doc, font, size);
  return doc.heightOfString(String(text), { width, align: 'left' });
}

// ---------------------------------------------------------------------------
// Section renderers — each takes / returns the Y cursor
// ---------------------------------------------------------------------------

function drawHeader(doc, data, logoPath) {
  const { margin, width, contentWidth } = PAGE;
  const top = margin;
  const logoSize = 46;
  const regBoxWidth = 170;
  const regBoxX = width - margin - regBoxWidth;
  const textX = margin + logoSize + 10;
  const textWidth = regBoxX - textX - 10;

  if (logoPath && fs.existsSync(logoPath)) {
    doc.image(logoPath, margin, top, { fit: [logoSize, logoSize] });
  }

  doc.fillColor(COLORS.muted);
  setFont(doc, FONT.regular, 7.5);
  doc.text(INSTITUTION.country, textX, top + 5, { width: textWidth, lineBreak: false });
  doc.fillColor(COLORS.ink);
  setFont(doc, FONT.bold, 13);
  doc.text(INSTITUTION.name, textX, top + 16, { width: textWidth, lineBreak: false });
  doc.fillColor(COLORS.muted);
  setFont(doc, FONT.regular, 8);
  doc.text(INSTITUTION.address, textX, top + 33, { width: textWidth, lineBreak: false });

  // Registration number box
  const boxY = top + 4;
  const boxH = 38;
  doc.lineWidth(0.75).strokeColor(COLORS.border).rect(regBoxX, boxY, regBoxWidth, boxH).stroke();
  doc.fillColor(COLORS.muted);
  setFont(doc, FONT.regular, 6.5);
  doc.text('REGISTRATION NO.', regBoxX, boxY + 7, { width: regBoxWidth, align: 'center', lineBreak: false });
  doc.fillColor(COLORS.accent);
  const regSize = fitFontSize(doc, data.registrationNumber, FONT.bold, 13, 8, regBoxWidth - 12);
  setFont(doc, FONT.bold, regSize);
  doc.text(data.registrationNumber, regBoxX + 6, boxY + 18, {
    width: regBoxWidth - 12,
    align: 'center',
    lineBreak: false
  });

  // Rule + title
  const ruleY = top + logoSize + 8;
  doc.lineWidth(1).strokeColor(COLORS.ink).moveTo(margin, ruleY).lineTo(margin + contentWidth, ruleY).stroke();

  doc.fillColor(COLORS.ink);
  setFont(doc, FONT.bold, 14);
  doc.text('CERTIFICATE OF REGISTRATION', margin, ruleY + 9, {
    width: contentWidth,
    align: 'center',
    characterSpacing: 1,
    lineBreak: false
  });

  return ruleY + 9 + 17 + 8;
}

function drawStudentInfo(doc, data, startY) {
  const { margin, contentWidth } = PAGE;
  const s = data.student;
  const cols = 3;
  const colWidth = contentWidth / cols;
  const padX = 6;
  const padY = 4;
  const labelSize = 6;
  const valueSize = 8.5;

  const rows = [
    [{ label: 'Student No.', value: s.number }, { label: 'Name', value: s.name.toUpperCase(), span: 2 }],
    [{ label: 'Program', value: s.program, span: 2 }, { label: 'Major', value: s.major }],
    [
      { label: 'Year Level', value: s.yearLevel },
      { label: 'Semester', value: s.semester },
      { label: 'School Year', value: s.schoolYear }
    ],
    [
      { label: 'Sex', value: s.sex },
      { label: 'Age', value: s.age },
      { label: 'College', value: s.college }
    ],
    [{ label: 'Curriculum', value: s.curriculum, span: 2 }, { label: 'Date Issued', value: data.issuedDate }]
  ];

  // Measure first so each row is exactly as tall as its tallest cell.
  const rowHeights = rows.map((row) =>
    Math.max(
      ...row.map((cell) => {
        const w = colWidth * (cell.span || 1) - padX * 2;
        return padY * 2 + labelSize + 3 + measure(doc, cell.value, w, FONT.bold, valueSize);
      })
    )
  );
  const totalHeight = rowHeights.reduce((a, b) => a + b, 0);

  // Inner separators (light)
  doc.lineWidth(0.5).strokeColor(COLORS.borderLight);
  let y = startY;
  rows.forEach((row, rowIndex) => {
    let x = margin;
    row.forEach((cell, cellIndex) => {
      const span = cell.span || 1;
      const w = colWidth * span;
      if (cellIndex > 0) doc.moveTo(x, y).lineTo(x, y + rowHeights[rowIndex]).stroke();

      doc.fillColor(COLORS.muted);
      setFont(doc, FONT.regular, labelSize);
      doc.text(cell.label.toUpperCase(), x + padX, y + padY, { width: w - padX * 2, lineBreak: false });
      doc.fillColor(COLORS.ink);
      setFont(doc, FONT.bold, valueSize);
      doc.text(String(cell.value), x + padX, y + padY + labelSize + 3, { width: w - padX * 2, align: 'left' });
      x += w;
    });
    y += rowHeights[rowIndex];
    if (rowIndex < rows.length - 1) doc.moveTo(margin, y).lineTo(margin + contentWidth, y).stroke();
  });

  // Outer border
  doc.lineWidth(0.75).strokeColor(COLORS.border).rect(margin, startY, contentWidth, totalHeight).stroke();

  return startY + totalHeight;
}

function drawTableHeader(doc, y) {
  const { margin, contentWidth } = PAGE;
  doc.save();
  doc.rect(margin, y, contentWidth, TABLE.headerHeight).fill(COLORS.fill);
  doc.restore();

  let x = margin;
  doc.fillColor(COLORS.ink);
  setFont(doc, FONT.bold, TABLE.fontSize);
  const textY = y + (TABLE.headerHeight - doc.currentLineHeight()) / 2;
  TABLE_COLUMNS.forEach((col) => {
    doc.text(col.label, x + TABLE.padX, textY, {
      width: col.width - TABLE.padX * 2,
      align: col.align,
      lineBreak: false
    });
    x += col.width;
  });

  drawCellGrid(doc, y, TABLE.headerHeight);
  return y + TABLE.headerHeight;
}

function drawCellGrid(doc, y, height) {
  doc.lineWidth(0.5).strokeColor(COLORS.border);
  let x = PAGE.margin;
  TABLE_COLUMNS.forEach((col) => {
    doc.rect(x, y, col.width, height).stroke();
    x += col.width;
  });
}

function drawTable(doc, rows, startY) {
  setFont(doc, FONT.regular, TABLE.fontSize);

  // Measure every row up-front.
  const measured = rows.map((row) => {
    const cellHeights = TABLE_COLUMNS.map((col) =>
      measure(doc, row[col.key], col.width - TABLE.padX * 2, FONT.regular, TABLE.fontSize)
    );
    const height = Math.max(TABLE.minRowHeight, Math.max(...cellHeights) + TABLE.padY * 2);
    return { row, cellHeights, height };
  });

  let y = drawTableHeader(doc, startY);

  const drawRow = ({ row, cellHeights, height }) => {
    if (y + height > PAGE.bottom) {
      doc.addPage();
      y = drawTableHeader(doc, PAGE.margin);
    }
    let x = PAGE.margin;
    doc.fillColor(COLORS.ink);
    setFont(doc, FONT.regular, TABLE.fontSize);
    TABLE_COLUMNS.forEach((col, i) => {
      const textY = y + (height - cellHeights[i]) / 2; // vertically centered
      doc.text(String(row[col.key]), x + TABLE.padX, textY, {
        width: col.width - TABLE.padX * 2,
        align: col.align
      });
      x += col.width;
    });
    drawCellGrid(doc, y, height);
    y += height;
  };

  measured.forEach(drawRow);

  // Blank filler rows so a short schedule still looks like a form
  const blanks = Math.max(0, TABLE.minRows - rows.length);
  for (let i = 0; i < blanks; i += 1) {
    if (y + TABLE.minRowHeight > PAGE.bottom) break;
    drawCellGrid(doc, y, TABLE.minRowHeight);
    y += TABLE.minRowHeight;
  }

  return y;
}

function drawTotals(doc, totals, y) {
  const { margin } = PAGE;
  const w1 = TABLE_COLUMNS[0].width + TABLE_COLUMNS[1].width; // code + subject
  const w2 = TABLE_COLUMNS[2].width; // units
  const w3 = PAGE.contentWidth - w1 - w2;

  doc.save();
  doc.rect(margin, y, PAGE.contentWidth, TOTALS_HEIGHT).fill(COLORS.fill);
  doc.restore();

  const cells = [
    { x: margin, w: w1, text: `TOTAL  (${totals.subjects} ${totals.subjects === 1 ? 'subject' : 'subjects'})`, align: 'left' },
    { x: margin + w1, w: w2, text: totals.units.toFixed(1), align: 'center' },
    {
      x: margin + w1 + w2,
      w: w3,
      text: `Lecture Units: ${totals.lecture.toFixed(1)}     |     Lab Units: ${totals.lab.toFixed(1)}`,
      align: 'left'
    }
  ];

  doc.fillColor(COLORS.ink);
  setFont(doc, FONT.bold, 8);
  const textY = y + (TOTALS_HEIGHT - doc.currentLineHeight()) / 2;
  doc.lineWidth(0.5).strokeColor(COLORS.border);
  cells.forEach((cell) => {
    doc.text(cell.text, cell.x + TABLE.padX + 2, textY, {
      width: cell.w - (TABLE.padX + 2) * 2,
      align: cell.align,
      lineBreak: false
    });
    doc.rect(cell.x, y, cell.w, TOTALS_HEIGHT).stroke();
  });

  return y + TOTALS_HEIGHT;
}

function drawCertification(doc, y) {
  doc.fillColor(COLORS.muted);
  setFont(doc, FONT.regular, 7);
  doc.text(CERTIFICATION_TEXT, PAGE.margin, y, { width: PAGE.contentWidth, align: 'left' });
}

function drawFooter(doc, data, qrMatrix) {
  const { margin, width, bottom } = PAGE;
  const top = bottom - FOOTER_HEIGHT;

  // --- QR column (right) ---
  const qrColX = width - margin - QR.columnWidth;
  const qrX = qrColX + (QR.columnWidth - QR.size) / 2;
  const qrY = top + 8; // 8pt above symbol = quiet zone
  drawQrVector(doc, qrMatrix, qrX, qrY, QR.size);

  const moduleSize = QR.size / qrMatrix.size;
  const labelY = qrY + QR.size + moduleSize * QR.quietZoneModules + 1; // stay outside the quiet zone
  doc.fillColor(COLORS.muted);
  setFont(doc, FONT.regular, 6.5);
  doc.text('Scan to download\nthe student mobile app', qrColX, labelY, {
    width: QR.columnWidth,
    align: 'center'
  });

  // --- Signature blocks (left + middle) ---
  const sigWidth = 190;
  const sigGap = 20;
  const sigLineY = top + 74;
  const blocks = [
    { x: margin, name: data.student.name.toUpperCase(), caption: "Student's Signature over Printed Name" },
    { x: margin + sigWidth + sigGap, name: data.registrarName.toUpperCase(), caption: 'College Registrar' }
  ];

  // Measure both names first so the captions line up and never collide with a wrapped name.
  // Names wrap onto at most 2 lines; anything longer is shortened with "..." (measured, not guessed).
  const NAME_MAX_LINES = 2;
  const prepared = blocks.map((block) => {
    const size = fitFontSize(doc, block.name, FONT.bold, 8, 6.5, sigWidth);
    setFont(doc, FONT.bold, size);
    const maxHeight = doc.currentLineHeight(true) * NAME_MAX_LINES + 1; // true = include font line gap, as PDFKit does when laying out
    let name = block.name;
    if (doc.heightOfString(name, { width: sigWidth }) > maxHeight) {
      while (name.length > 1 && doc.heightOfString(`${name}...`, { width: sigWidth }) > maxHeight) {
        name = name.slice(0, -1);
      }
      name = `${name.trimEnd()}...`;
    }
    return { ...block, name, size, height: doc.heightOfString(name, { width: sigWidth }) };
  });
  const nameHeight = Math.max(...prepared.map((block) => block.height));

  prepared.forEach((block) => {
    doc.lineWidth(0.75).strokeColor(COLORS.ink).moveTo(block.x, sigLineY).lineTo(block.x + sigWidth, sigLineY).stroke();
    doc.fillColor(COLORS.ink);
    setFont(doc, FONT.bold, block.size);
    doc.text(block.name, block.x, sigLineY + 4, { width: sigWidth, align: 'center' });
    doc.fillColor(COLORS.muted);
    setFont(doc, FONT.regular, 6.5);
    doc.text(block.caption, block.x, sigLineY + 4 + nameHeight + 3, {
      width: sigWidth,
      align: 'center',
      lineBreak: false
    });
  });
}

function drawPageNumbers(doc, data) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    const y = PAGE.height - 30;
    doc.lineWidth(0.5).strokeColor(COLORS.borderLight)
      .moveTo(PAGE.margin, y - 4).lineTo(PAGE.margin + PAGE.contentWidth, y - 4).stroke();
    doc.fillColor(COLORS.muted);
    setFont(doc, FONT.regular, 6.5);
    doc.text(
      `${INSTITUTION.name}  |  Certificate of Registration  |  ${data.registrationNumber}`,
      PAGE.margin, y, { width: PAGE.contentWidth * 0.75, lineBreak: false }
    );
    doc.text(`Page ${i + 1} of ${range.count}`, PAGE.margin + PAGE.contentWidth * 0.75, y, {
      width: PAGE.contentWidth * 0.25,
      align: 'right',
      lineBreak: false
    });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

class CorPdfService {
  static get helpers() {
    return {
      cleanText,
      extractProgram,
      extractMajor,
      calculateAge,
      formatStudentNumber,
      formatClassBlockLabel,
      parseScheduleMeetings,
      buildSubjectRow,
      computeUnitBreakdown
    };
  }

  /**
   * @param {object} data
   * @param {string} data.registrationNumber
   * @param {string} data.issuedDate
   * @param {string} data.registrarName
   * @param {string} data.qrUrl                 URL encoded in the QR code
   * @param {string} [data.logoPath]
   * @param {object} data.student               { number, name, program, major, yearLevel, semester,
   *                                              schoolYear, sex, age, college, curriculum }
   * @param {object[]} data.subjects            rows from buildSubjectRow()
   * @param {object} data.totals                { subjects, units, lecture, lab }
   * @returns {Promise<Buffer>}
   */
  static generate(data) {
    return new Promise((resolve, reject) => {
      try {
        // Build QR first: if it fails we reject before any PDF work is done.
        const qrMatrix = buildQrMatrix(data.qrUrl);

        const doc = new PDFDocument({
          size: 'LETTER',
          margin: 0, // layout is fully managed by PAGE constants (prevents PDFKit auto page breaks)
          bufferPages: true,
          info: {
            Title: `Certificate of Registration - ${data.student.number}`,
            Author: INSTITUTION.name,
            Subject: 'Certificate of Registration',
            Creator: `${INSTITUTION.name} Registrar`
          }
        });

        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        let y = drawHeader(doc, data, data.logoPath || DEFAULT_LOGO_PATH);
        y = drawStudentInfo(doc, data, y);

        // Section label
        y += 10;
        doc.fillColor(COLORS.ink);
        setFont(doc, FONT.bold, 8);
        doc.text('SCHEDULE OF SUBJECTS', PAGE.margin, y, {
          width: PAGE.contentWidth,
          align: 'left',
          characterSpacing: 0.5,
          lineBreak: false
        });
        y += 13;

        y = drawTable(doc, data.subjects, y);

        // The footer is pinned to the bottom of the last page. If totals + certification
        // would collide with it, move them (and the footer) to a fresh page.
        const footerTop = PAGE.bottom - FOOTER_HEIGHT;
        setFont(doc, FONT.regular, 7);
        const certHeight = doc.heightOfString(CERTIFICATION_TEXT, { width: PAGE.contentWidth });
        const needed = TOTALS_HEIGHT + 8 + certHeight + 8;
        if (y + needed > footerTop) {
          doc.addPage();
          y = PAGE.margin;
        }

        y = drawTotals(doc, data.totals, y);
        drawCertification(doc, y + 8);
        drawFooter(doc, data, qrMatrix);
        drawPageNumbers(doc, data);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = CorPdfService;
