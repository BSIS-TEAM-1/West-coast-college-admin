import { useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, RefreshCw, X } from 'lucide-react'
import StudentService from '../lib/studentApi'
import { getStoredToken } from '../lib/authApi'
import { downloadCsv } from '../lib/csv'
import {
  STUDENT_IMPORT_REQUIRED_FIELDS,
  STUDENT_IMPORT_TEMPLATE_HEADERS,
  parseStudentImportCsv,
  type StudentImportParseResult,
  type StudentImportRow
} from '../lib/studentImport'
import { StudentWorkspaceOverlay, isStudentWorkspaceBackdropTarget } from './shared/StudentWorkspaceOverlay'
import './StudentImportModal.css'

type ImportFailure = {
  rowNumber: number
  name: string
  error: string
}

type ImportOutcome = {
  imported: number
  total: number
  failures: ImportFailure[]
}

export default function StudentImportModal({
  onClose,
  onImported
}: {
  onClose: () => void
  onImported: (count: number) => Promise<void> | void
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [fileName, setFileName] = useState('')
  const [parseResult, setParseResult] = useState<StudentImportParseResult | null>(null)
  const [fileError, setFileError] = useState('')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)

  const rows = useMemo(() => parseResult?.rows ?? [], [parseResult])
  const validRows = useMemo(() => rows.filter((row) => row.payload), [rows])
  const invalidRows = useMemo(() => rows.filter((row) => !row.payload), [rows])
  const previewRows = useMemo(() => rows.slice(0, 50), [rows])

  const downloadTemplate = () => {
    downloadCsv('student-import-template.csv', [STUDENT_IMPORT_TEMPLATE_HEADERS])
  }

  const handleFile = async (file: File | null) => {
    if (!file) return

    setFileError('')
    setOutcome(null)
    setFileName(file.name)

    if (!/\.csv$/i.test(file.name)) {
      setParseResult(null)
      setFileError('Choose a .csv file. Use the template link above to get the required columns.')
      return
    }

    try {
      const text = await file.text()
      setParseResult(parseStudentImportCsv(text))
    } catch {
      setParseResult(null)
      setFileError('The file could not be read. Save it as CSV and try again.')
    }
  }

  const resetFile = () => {
    setFileName('')
    setParseResult(null)
    setFileError('')
    setOutcome(null)
    setProgress({ done: 0, total: 0 })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleImport = async () => {
    if (!validRows.length || importing) return

    setImporting(true)
    setProgress({ done: 0, total: validRows.length })

    try {
      const token = await getStoredToken()
      if (!token) throw new Error('No authentication token found. Please log in again.')

      const failures: ImportFailure[] = []
      let imported = 0

      for (const row of validRows) {
        if (!row.payload) continue
        try {
          await StudentService.createStudent(token, row.payload)
          imported += 1
        } catch (importError) {
          failures.push({
            rowNumber: row.rowNumber,
            name: row.displayName,
            error: importError instanceof Error ? importError.message : 'Failed to create student'
          })
        }
        setProgress((current) => ({ ...current, done: current.done + 1 }))
      }

      setOutcome({ imported, total: validRows.length, failures })
      if (imported > 0) await onImported(imported)
    } catch (importError) {
      setFileError(importError instanceof Error ? importError.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const canClose = !importing

  return (
    <StudentWorkspaceOverlay>
      <div
        className="student-workspace__modal-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-import-title"
        onPointerDown={(event) => {
          if (canClose && isStudentWorkspaceBackdropTarget(event)) onClose()
        }}
      >
        <div className="student-workspace__modal-overlay" aria-hidden="true" />
        <div className="student-workspace__modal student-workspace__modal--wide">
          <header className="student-workspace__modal-header">
            <div>
              <span className="student-workspace__eyebrow">Student registry</span>
              <h2 id="student-import-title">Import students</h2>
              <p className="student-workspace__modal-subcopy">
                Upload a CSV that follows the student import template. Rows are validated before anything is created,
                and invalid rows are skipped instead of stopping the whole file.
              </p>
            </div>
            <button
              type="button"
              className="student-workspace__ghost-button"
              onClick={onClose}
              disabled={!canClose}
              aria-label="Close import"
            >
              <X size={18} />
            </button>
          </header>

          <div className="student-workspace__modal-body">
            {outcome ? (
              <div className="student-import__result">
                <div className="student-import__result-card">
                  <CheckCircle2 size={28} className={outcome.imported > 0 ? 'student-import__result-ok' : undefined} />
                  <div>
                    <h3>Import finished</h3>
                    <p>
                      Created <strong>{outcome.imported.toLocaleString()}</strong> of{' '}
                      {outcome.total.toLocaleString()} ready student{outcome.total === 1 ? '' : 's'} from{' '}
                      {fileName || 'the selected file'}.
                      {outcome.failures.length > 0
                        ? ` ${outcome.failures.length.toLocaleString()} row${outcome.failures.length === 1 ? '' : 's'} could not be created.`
                        : ''}
                    </p>
                  </div>
                </div>

                {outcome.failures.length > 0 ? (
                  <ul className="student-import__failure-list">
                    {outcome.failures.map((failure) => (
                      <li key={`${failure.rowNumber}-${failure.name}`}>
                        <strong>
                          Row {failure.rowNumber} · {failure.name}
                        </strong>
                        <span>{failure.error}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <p className="student-import__note">
                  Imported students start with the lifecycle status in the file (Pending by default). Enroll and
                  assign their block from Student Management after import.
                </p>
              </div>
            ) : (
              <>
                {!parseResult ? (
                  <>
                    <section className="student-import__intro">
                      <div>
                        <h3>1. Use the required format</h3>
                        <p>
                          Download the template, keep its header row, and fill one student per line. Column order does
                          not matter — headers are matched by name. Student Number is optional; leave it blank to let
                          the system assign the next number.
                        </p>
                      </div>
                      <button type="button" className="student-import__template-button" onClick={downloadTemplate}>
                        <Download size={15} />
                        Download template
                      </button>
                    </section>

                    <section className="student-import__format">
                      <div>
                        <strong>Required for every row</strong>
                      </div>
                      <ul className="student-import__format-list">
                        {STUDENT_IMPORT_REQUIRED_FIELDS.map((field) => (
                          <li key={field}>{field}</li>
                        ))}
                      </ul>
                      <p className="student-import__note">
                        Course accepts BEED, BSEd-English, BSEd-Math, BSBA-HRM, or 101/102/103/201. Semester accepts
                        1st, 2nd, or Summer.                        School Year uses YYYY-YYYY (e.g. 2026-2027). Lifecycle accepts Pending,
                        Not Enrolled, Irregular, Inactive, or Graduated; Enrolled imports as Pending because enrollment
                        is a separate step.

                      </p>
                    </section>

                    <div className="student-import__file-row">
                      <input
                        ref={fileInputRef}
                        id="student-import-file"
                        className="student-import__file-input"
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
                      />
                      <label htmlFor="student-import-file" className="student-import__file-label">
                        <FileSpreadsheet size={16} />
                        Choose CSV file
                      </label>
                      {fileName ? <span className="student-import__file-name">{fileName}</span> : null}
                    </div>

                    {fileError ? (
                      <div className="student-import__error-box" role="alert">
                        <AlertCircle size={16} />
                        <span>{fileError}</span>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="student-import__file-row">
                      <span className="student-import__file-name">{fileName}</span>
                      <button type="button" className="student-workspace__ghost-button" onClick={resetFile} disabled={importing}>
                        Choose another file
                      </button>
                    </div>

                    {parseResult.fatalError ? (
                      <div className="student-import__error-box" role="alert">
                        <AlertCircle size={16} />
                        <span>{parseResult.fatalError}</span>
                      </div>
                    ) : (
                      <>
                        <div className="student-import__summary">
                          <span className="student-import__chip student-import__chip--ok">
                            {validRows.length.toLocaleString()} ready
                          </span>
                          {invalidRows.length > 0 ? (
                            <span className="student-import__chip student-import__chip--bad">
                              {invalidRows.length.toLocaleString()} with errors
                            </span>
                          ) : null}
                          <span className="student-import__chip">{rows.length.toLocaleString()} row(s) read</span>
                        </div>

                        {rows.length === 0 ? (
                          <div className="student-import__error-box" role="alert">
                            <AlertCircle size={16} />
                            <span>No student rows found below the header row.</span>
                          </div>
                        ) : (
                          <div className="student-import__preview">
                            <table>
                              <thead>
                                <tr>
                                  <th>Row</th>
                                  <th>Student</th>
                                  <th>Course / Year</th>
                                  <th>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {previewRows.map((row) => (
                                  <PreviewRow key={row.rowNumber} row={row} />
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {rows.length > previewRows.length ? (
                          <p className="student-import__note">
                            Showing the first {previewRows.length.toLocaleString()} rows. All{' '}
                            {rows.length.toLocaleString()} rows will be validated the same way.
                          </p>
                        ) : null}

                        {invalidRows.length > 0 ? (
                          <p className="student-import__note">
                            Rows with errors are left out of the import. Fix them in the file and choose it again to
                            include them.
                          </p>
                        ) : null}
                      </>
                    )}

                    {fileError ? (
                      <div className="student-import__error-box" role="alert">
                        <AlertCircle size={16} />
                        <span>{fileError}</span>
                      </div>
                    ) : null}
                  </>
                )}
              </>
            )}
          </div>

          <footer className="student-workspace__modal-actions">
            {outcome ? (
              <button type="button" className="student-workspace__primary-button" onClick={onClose}>
                Done
              </button>
            ) : (
              <>
                <button type="button" className="student-workspace__ghost-button" onClick={onClose} disabled={importing}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="student-workspace__primary-button"
                  onClick={() => void handleImport()}
                  disabled={importing || !validRows.length}
                >
                  {importing ? <RefreshCw size={16} className="student-import__spin" /> : null}
                  {importing
                    ? `Importing ${progress.done + 1 > progress.total ? progress.total : progress.done + 1} of ${progress.total}...`
                    : `Import ${validRows.length.toLocaleString()} student${validRows.length === 1 ? '' : 's'}`}
                </button>
              </>
            )}
          </footer>
        </div>
      </div>
    </StudentWorkspaceOverlay>
  )
}

function PreviewRow({ row }: { row: StudentImportRow }) {
  const course = row.payload
    ? String(row.payload.course)
    : row.values.course || '—'
  const yearLevel = row.payload ? String(row.payload.yearLevel) : row.values.yearLevel || '—'

  return (
    <tr className={row.errors.length ? 'student-import__preview-row--error' : undefined}>
      <td>{row.rowNumber}</td>
      <td>{row.displayName}</td>
      <td>
        {course} / {yearLevel}
      </td>
      <td>
        {row.errors.length === 0 ? (
          <span className="student-import__row-ok">Ready</span>
        ) : (
          <div className="student-import__row-error">
            <strong>Fix {row.errors.length} issue{row.errors.length === 1 ? '' : 's'}</strong>
            <ul className="student-import__error-list">
              {row.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}
      </td>
    </tr>
  )
}
