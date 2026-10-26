export default async function run(page, ui) {
  // Navigate to landing page and click SIGN IN
  await page.goto('http://localhost:5174', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)

  const snapshot = await ui.snapshot()
  console.log('Initial snapshot:', snapshot)

  // Look for SIGN IN button
  const signInMatch = snapshot.match(/@(e\d+) button "SIGN IN"/)
  if (!signInMatch) {
    return { error: 'SIGN IN button not found', snapshot }
  }

  await ui.click(signInMatch[1])
  await page.waitForTimeout(1500)

  // Now on login page
  const loginSnapshot = await ui.snapshot()
  console.log('Login snapshot:', loginSnapshot)

  // Fill login form
  const inputs = await page.locator('input').all()
  if (inputs.length >= 2) {
    await inputs[0].fill('professor')
    await inputs[1].fill('password123')
    await page.waitForTimeout(500)

    // Find and click submit button
    const buttons = await page.locator('button').all()
    for (const btn of buttons) {
      const text = await btn.textContent()
      if (text && (text.includes('Sign In') || text.includes('SIGN IN'))) {
        await btn.click()
        break
      }
    }
  }

  await page.waitForTimeout(3000)

  // Check if we're on dashboard
  const dashboardSnapshot = await ui.snapshot()
  console.log('Dashboard snapshot:', dashboardSnapshot)

  // Look for Schedule navigation
  const scheduleMatch = dashboardSnapshot.match(/@(e\d+) button.*Schedule|@(e\d+) link.*Schedule/i)
  if (scheduleMatch) {
    await ui.click(scheduleMatch[1] || scheduleMatch[2])
    await page.waitForTimeout(2000)
  }

  // Take screenshot of schedule page
  await page.screenshot({ path: 'C:/dev/WCC-Admin/schedule-page.png', fullPage: true })

  const finalSnapshot = await ui.snapshot()

  return {
    initial: snapshot,
    login: loginSnapshot,
    dashboard: dashboardSnapshot,
    final: finalSnapshot
  }
}
