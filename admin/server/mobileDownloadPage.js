const fs = require('fs');
const path = require('path');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return 'Unknown size';
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function readAppVersion(flutterAppDir) {
  try {
    const pubspec = fs.readFileSync(path.join(flutterAppDir, 'pubspec.yaml'), 'utf8');
    const match = pubspec.match(/^version:\s*([^\s#]+)/m);
    return match ? match[1].trim() : '';
  } catch {
    return '';
  }
}

/**
 * Public download landing page for the WCConnect student mobile app.
 * Served at GET /download-apk so every printed QR code (e.g. on the COR)
 * keeps working: scan -> this page -> tap Download.
 */
function renderMobileDownloadPage({ available, fileName, fileSize, appVersion }) {
  const safeFile = escapeHtml(fileName || 'WCConnect.apk');
  const safeSize = escapeHtml(fileSize || '');
  const safeVersion = escapeHtml(appVersion || '');
  const statusBlock = available
    ? `<a class="dl-btn" href="/download-apk/file" download>Download for Android${safeSize ? ` (${safeSize})` : ''}</a>
       <p class="dl-meta">${safeFile}${safeVersion ? ` &bull; v${safeVersion}` : ''}</p>`
    : `<div class="dl-notice" role="status">No app build is published yet. Please ask the Registrar's Office or try again later.</div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#7c2d12">
<title>WCConnect — Student App Download | West Coast College</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px;
    font-family: Arial, Helvetica, sans-serif; background: #f1f5f9; color: #1e293b; }
  .dl-card { width: min(480px, 100%); background: #ffffff; border: 1px solid #e2e8f0;
    border-radius: 16px; overflow: hidden; text-align: center; box-shadow: 0 18px 44px rgba(2,6,23,.10); }
  .dl-hero { background: #7c2d12; color: #fff; padding: 32px 24px 24px; }
  .dl-badge { display: inline-flex; align-items: center; justify-content: center; width: 72px; height: 72px;
    border-radius: 50%; background: #fff; color: #7c2d12; font-weight: 700; font-size: 22px;
    border: 2px solid #fde68a; }
  .dl-kicker { margin: 16px 0 0; font-size: 12px; font-weight: 700; letter-spacing: 2px; color: #fde68a; }
  .dl-hero h1 { margin: 6px 0 0; font-size: 24px; }
  .dl-hero p { margin: 8px 0 0; font-size: 14px; color: #fde68a; opacity: .9; }
  .dl-body { padding: 28px 24px 32px; }
  .dl-body > p { font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 20px; }
  .dl-btn { display: inline-block; padding: 14px 28px; border-radius: 10px; background: #7c2d12; color: #fff;
    font-size: 16px; font-weight: 700; text-decoration: none; }
  .dl-btn:active { transform: scale(.98); }
  .dl-meta { margin: 12px 0 0; font-size: 12px; color: #64748b; }
  .dl-notice { border: 1px solid #fcd34d; background: #fffbeb; color: #92400e; border-radius: 10px;
    padding: 14px; font-size: 14px; line-height: 1.5; }
  .dl-steps { margin: 24px 0 0; padding: 0; list-style: none; text-align: left; font-size: 13px; color: #475569; }
  .dl-steps li { display: flex; gap: 10px; padding: 8px 0; border-top: 1px solid #f1f5f9; line-height: 1.5; }
  .dl-steps li:first-child { border-top: 0; }
  .dl-num { flex: 0 0 auto; width: 22px; height: 22px; border-radius: 50%; background: #7c2d12; color: #fff;
    font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
  .dl-foot { margin: 20px 0 0; font-size: 11px; color: #94a3b8; }
</style>
</head>
<body>
  <main class="dl-card">
    <div class="dl-hero">
      <span class="dl-badge">WCC</span>
      <p class="dl-kicker">WEST COAST COLLEGE</p>
      <h1>WCConnect Student App</h1>
      <p>Grades, schedule, COR &amp; announcements on your phone</p>
    </div>
    <div class="dl-body">
      <p>You scanned a code from your Certificate of Registration. Tap below to get the official student app for Android.</p>
      ${statusBlock}
      <ol class="dl-steps">
        <li><span class="dl-num">1</span><span>Tap Download and wait for the APK file to finish.</span></li>
        <li><span class="dl-num">2</span><span>Open the file and allow <strong>Install unknown apps</strong> for your browser when asked.</span></li>
        <li><span class="dl-num">3</span><span>Open WCConnect and log in with your student number and password.</span></li>
      </ol>
      <p class="dl-foot">Android only &bull; Free &bull; Provided by the Registrar&apos;s Office</p>
    </div>
  </main>
</body>
</html>`;
}

module.exports = { renderMobileDownloadPage, formatBytes, readAppVersion };
