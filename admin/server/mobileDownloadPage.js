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
 * Styled to follow the requested structure with WCC theme & color palette.
 */
function renderMobileDownloadPage({ available, fileName, fileSize, appVersion }) {
  const safeFile = escapeHtml(fileName || 'WCConnect-arm64.apk');
  const safeSize = escapeHtml(fileSize || '');
  const safeVersion = escapeHtml(appVersion || '1.0.0+1');
  const statusBlock = available
    ? `<a class="btn btn-dark" href="/download-apk/file" download="${safeFile}">Download for Android</a>`
    : `<div class="dl-feedback" role="status">No APK build is currently published. Please contact the Registrar's Office.</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Get the App — WCConnect | West Coast College</title>
  <meta name="description" content="Download the WCConnect Android app — grades, schedules, attendance, and official student portal for West Coast College." />
  <link rel="icon" type="image/png" href="/wcc-app-icon.png" />
  <style>
    :root {
      --navy: #002147;
      --navy-dark: #00142b;
      --blue: #1A56DB;
      --blue-dark: #123E9E;
      --gold: #C69214;
      --text: #0F172A;
      --muted: #526077;
      --line: #DBE3ED;
      --bg: #F4F6F9;
      --white: #fff;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    a { color: inherit; text-decoration: none; }
    .wrap { max-width: 1120px; margin: 0 auto; padding: 0 24px; width: 100%; }

    nav {
      border-bottom: 1px solid var(--line);
      padding: 14px 0;
      background: rgba(244, 246, 249, 0.92);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    nav .wrap { display: flex; align-items: center; justify-content: space-between; }
    .logo { display: inline-flex; align-items: center; gap: 12px; }
    .logo img { height: 48px; width: auto; object-fit: contain; }
    .logo-text { display: flex; flex-direction: column; }
    .logo-text strong { font-size: 16px; color: var(--navy); line-height: 1.2; }
    .logo-text small { font-size: 12px; color: var(--muted); font-weight: 500; }

    .btn {
      display: inline-block; padding: 10px 22px; border-radius: 8px;
      font-weight: 600; font-size: 15px; border: 1px solid transparent;
      transition: background .15s, border-color .15s, transform .15s;
    }
    .btn-dark { background: var(--navy); color: #fff; box-shadow: 0 4px 14px rgba(0, 33, 71, 0.2); }
    .btn-dark:hover { background: var(--blue); color: #fff; transform: translateY(-1px); }
    .btn-outline { border-color: var(--navy); color: var(--navy); background: transparent; }
    .btn-outline:hover { background: var(--navy); color: #fff; }

    main { flex: 1; display: flex; align-items: center; }
    .dl-grid {
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 64px; align-items: center;
      padding: 48px 0;
    }
    .dl-img { display: flex; justify-content: center; }
    .dl-img img {
      max-width: 420px; width: 100%; height: auto;
      border-radius: 24px;
      box-shadow: 0 30px 60px rgba(0, 33, 71, 0.2);
    }
    .dl-copy h1 { font-size: clamp(36px, 5vw, 52px); font-weight: 800; letter-spacing: -1px; margin-bottom: 24px; color: var(--navy); }
    .dl-copy p { font-size: 17px; color: var(--text); margin-bottom: 18px; max-width: 460px; line-height: 1.65; }
    .dl-copy .sign { font-weight: 700; margin-bottom: 32px; color: var(--navy); font-size: 18px; }
    .dl-cta { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
    .dl-cta .btn-dark { padding: 14px 32px; font-size: 16px; border-radius: 10px; }
    .dl-feedback {
      padding: 10px 16px; background: #fef2f2; border: 1px solid #fecaca;
      border-radius: 8px; color: #991b1b; font-size: 13px; font-weight: 500;
    }
    .dl-meta { margin-top: 22px; font-size: 13px; color: var(--muted); }

    footer {
      border-top: 1px solid var(--line); padding: 24px 0;
      text-align: center; font-size: 13px; color: var(--muted);
      background: rgba(244, 246, 249, 0.7);
    }

    @media (max-width: 860px) {
      .dl-grid { grid-template-columns: 1fr; gap: 40px; text-align: center; padding: 40px 0; }
      .dl-copy p { margin-left: auto; margin-right: auto; }
      .dl-cta { justify-content: center; }
      .dl-img img { max-width: 300px; }
    }
  </style>
</head>
<body>

<nav>
  <div class="wrap">
    <a class="logo" href="/">
      <img src="/logo-bg-removed.png" alt="West Coast College" onerror="this.src='/Logo.jpg'" />
      <span class="logo-text">
        <strong>West Coast College</strong>
        <small>WCConnect Mobile Portal</small>
      </span>
    </a>
    <a href="/" class="btn btn-outline" style="padding: 8px 18px; font-size: 14px;">&larr; Back to site</a>
  </div>
</nav>

<main>
  <div class="wrap">
    <div class="dl-grid">
      <div class="dl-img">
        <img src="/Download-phone-feature.png" alt="WCConnect app on a phone" onerror="this.src='/Logo.jpg'" />
      </div>
      <div class="dl-copy">
        <h1>Get The App</h1>
        <p>Ready to carry your campus in your pocket?</p>
        <p>
          Access your real-time verified grades, official Certificate of Registration (COR),
          class schedules, faculty evaluations, and campus announcements &mdash; built
          exclusively for West Coast College students and faculty.
        </p>
        <p class="sign">Time to get connected.</p>
        <div class="dl-cta">
          ${statusBlock}
        </div>
        <div class="dl-meta">Android 8.0+ &middot; Version ${safeVersion} &middot; ${safeSize ? safeSize + ' &middot; ' : ''}Direct APK &middot; Powered by West Coast College</div>
      </div>
    </div>
  </div>
</main>

<footer>
  <div>West Coast College &mdash; Official Student &amp; Faculty Mobile Portal</div>
</footer>

</body>
</html>`;
}

module.exports = { renderMobileDownloadPage, formatBytes, readAppVersion };
