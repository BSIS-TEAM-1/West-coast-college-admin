export default async function run(page, ui) {
  // Navigate to login
  await page.goto('http://localhost:5174/login', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)

  // Take snapshot to see login form
  const loginSnapshot = await ui.snapshot()

  // Find username and password fields, and sign in button
  // We'll use selectors since we know the form structure
  const usernameInput = page.locator('input[type="text"], input[name="username"], input[placeholder*="username"], input[placeholder*="Username"]')
  const passwordInput = page.locator('input[type="password"]')
  const signInButton = page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("SIGN IN")')

  // Check if elements exist
  const hasUsername = await usernameInput.count() > 0
  const hasPassword = await passwordInput.count() > 0
  const hasButton = await signInButton.count() > 0

  if (!hasUsername || !hasPassword || !hasButton) {
    return {
      error: 'Login form not found',
      loginSnapshot,
      hasUsername,
      hasPassword,
      hasButton
    }
  }

  // Fill in credentials (using test credentials if available)
  await usernameInput.fill('professor')
  await passwordInput.fill('password123')
  await page.waitForTimeout(500)

  // Click sign in
  await signInButton.click()
  await page.waitForTimeout(2000)

  // Take snapshot after login
  const afterLogin = await ui.snapshot()

  // Navigate to schedule if we're on professor dashboard
  const scheduleButton = page.locator('button:has-text("Schedule"), a:has-text("Schedule")')
  const hasScheduleButton = await scheduleButton.count() > 0

  if (hasScheduleButton) {
    await scheduleButton.click()
    await page.waitForTimeout(1500)
  }

  // Take final snapshot
  const finalSnapshot = await ui.snapshot()

  // Take screenshot
  await page.screenshot({ path: 'C:/dev/WCC-Admin/schedule-page.png', fullPage: true })

  return {
    loginSnapshot,
    afterLogin,
    finalSnapshot,
    hasScheduleButton
  }
}
