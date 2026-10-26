export default async function run(page, ui) {
  // Navigate to the login page
  await page.goto('http://localhost:5174/login', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)

  // Take snapshot
  const loginSnapshot = await ui.snapshot()

  // If we're on the landing page with a SIGN IN button, click it
  const signInMatch = loginSnapshot.match(/@(e\d+) button "SIGN IN"/)
  if (signInMatch) {
    await ui.click(signInMatch[1])
    await page.waitForTimeout(1000)
  }

  // Get snapshot after clicking sign in
  const afterSignIn = await ui.snapshot()

  return {
    loginSnapshot,
    afterSignIn
  }
}
