/**import { useState } from 'react'
import { getStoredToken, API_URL } from '../lib/authApi'

export default function StudentPasswords() {
  const [loading, setLoading] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [results, setResults] = useState<any>(null)
  const [error, setError] = useState<string>('')

  const generatePasswords = async () => {
    setLoading(true)
    setError('')
    setResults(null)

    try {
      const token = await getStoredToken()
      const response = await fetch(`${API_URL}/api/admin/migrate-student-passwords`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()
      
      if (response.ok) {
        setResults(data)
      } else {
        setError(data.error || 'Failed to generate passwords')
      }
    } catch (err) {
      setError('An error occurred while generating passwords')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const clearPasswords = async () => {
    if (!confirm('Are you sure you want to clear all student passwords? This will remove passwords for all students.')) {
      return
    }

    setClearing(true)
    setError('')
    setResults(null)

    try {
      const token = await getStoredToken()
      const response = await fetch(`${API_URL}/api/admin/clear-student-passwords`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()
      
      if (response.ok) {
        setResults(data)
      } else {
        setError(data.error || 'Failed to clear passwords')
      }
    } catch (err) {
      setError('An error occurred while clearing passwords')
      console.error(err)
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Student Password Management</h1>
        <p>Generate default passwords for students who don't have passwords set</p>
      </div>

      <div className="content-card">
        <div className="action-section" style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={generatePasswords}
            disabled={loading || clearing}
            className="btn btn-primary"
          >
            {loading ? 'Generating Passwords...' : 'Generate Student Passwords'}
          </button>
          <button
            onClick={clearPasswords}
            disabled={loading || clearing}
            className="btn btn-danger"
            style={{ background: '#dc3545', color: 'white' }}
          >
            {clearing ? 'Clearing Passwords...' : 'Clear All Passwords'}
          </button>
        </div>

        {error && (
          <div className="error-message" style={{ color: 'red', marginTop: '20px' }}>
            {error}
          </div>
        )}

        {results && (
          <div className="results-section" style={{ marginTop: '30px' }}>
            <h2>Migration Results</h2>
            <div className="summary" style={{ marginBottom: '20px' }}>
              <p><strong>Total students:</strong> {results.summary.total}</p>
              <p><strong>Successful:</strong> {results.summary.successful}</p>
              <p><strong>Failed:</strong> {results.summary.failed}</p>
            </div>

            {results.summary.successful > 0 && (
              <div className="passwords-list">
                <h3>Generated Passwords</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #ddd' }}>
                      <th style={{ padding: '10px', textAlign: 'left' }}>Student UID</th>
                      <th style={{ padding: '10px', textAlign: 'left' }}>Name</th>
                      <th style={{ padding: '10px', textAlign: 'left' }}>Password</th>
                      <th style={{ padding: '10px', textAlign: 'left' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.results.map((result: any, index: number) => (
                      <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '10px' }}>{result.studentNumber}</td>
                        <td style={{ padding: '10px' }}>{result.name}</td>
                        <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 'bold' }}>
                          {result.password || 'N/A'}
                        </td>
                        <td style={{ padding: '10px' }}>
                          <span style={{
                            color: result.status === 'success' ? 'green' : 'red',
                            fontWeight: 'bold'
                          }}>
                            {result.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {results.summary.failed > 0 && (
              <div className="failed-list" style={{ marginTop: '20px' }}>
                <h3>Failed Migrations</h3>
                {results.results
                  .filter((r: any) => r.status === 'failed')
                  .map((result: any, index: number) => (
                    <div key={index} style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
                      <strong>{result.studentNumber}</strong> - {result.name}: {result.error}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
  **/