/**
 * seedMockAnnouncements.js
 *
 * Inserts a set of realistic mock announcements for the admin portal.
 * Intended for fresh/dev environments where the announcements collection is
 * empty (for example after running resetOperationalData.js).
 *
 * Usage:
 *   node scripts/seedMockAnnouncements.js             # preview
 *   node scripts/seedMockAnnouncements.js --apply     # insert
 *   node scripts/seedMockAnnouncements.js --apply --replace
 *
 * --replace removes announcements with the same titles first, so the script
 * can be re-run safely.
 */
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const Announcement = require('../models/Announcement');
const Admin = require('../models/Admin');

for (const file of ['.env', '.env.credential-details', '.env.credentail-details']) {
  const fullPath = path.join(__dirname, '..', '..', file);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath, override: file !== '.env' });
  }
}

const APPLY = process.argv.includes('--apply');
const REPLACE = process.argv.includes('--replace');

const daysFromNow = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const MOCK_ANNOUNCEMENTS = [
  {
    title: 'Enrollment for SY 2026-2027 is now open',
    message:
      'Enrollment for the first semester of SY 2026-2027 is now open. Students may visit the Registrar\'s Office or enroll through the portal. Please prepare your COR and latest grades.',
    type: 'info',
    targetAudience: ['all'],
    isPinned: true,
    expiresAt: daysFromNow(30),
  },
  {
    title: 'Submission of Certificate of Registration (COR)',
    message:
      'All students must secure their Certificate of Registration (COR) for the current semester. Please download or claim your COR from the Registrar\'s Office before the deadline.',
    type: 'warning',
    targetAudience: ['students'],
    isPinned: true,
    expiresAt: daysFromNow(14),
  },
  {
    title: 'Deadline for final grade submission',
    message:
      'Professors are reminded that final grades for the current semester must be submitted through the faculty portal on or before the deadline. Late submissions require approval from the Dean.',
    type: 'urgent',
    targetAudience: ['professor'],
    isPinned: false,
    expiresAt: daysFromNow(5),
  },
  {
    title: 'Faculty meeting: Curriculum alignment',
    message:
      'There will be a faculty meeting to discuss curriculum alignment, subject offerings, and assessment plans for SY 2026-2027. Attendance is required for all full-time professors.',
    type: 'info',
    targetAudience: ['professor'],
    isPinned: false,
    expiresAt: daysFromNow(10),
  },
  {
    title: 'Registrar office schedule update',
    message:
      'Starting this week, the Registrar\'s Office will be open from 8:00 AM to 5:00 PM, Monday to Friday. Processing of late enrollment and document requests will stop at 4:30 PM.',
    type: 'info',
    targetAudience: ['registrar'],
    isPinned: false,
    expiresAt: daysFromNow(21),
  },
  {
    title: 'Scheduled system maintenance',
    message:
      'The admin portal will be unavailable on Saturday from 10:00 PM to 2:00 AM for scheduled maintenance and database updates. Please save your work before the maintenance window.',
    type: 'maintenance',
    targetAudience: ['all'],
    isPinned: false,
    expiresAt: daysFromNow(3),
  },
  {
    title: 'Scholarship applications now open',
    message:
      'Applications for academic and financial scholarships are now open. Interested students may submit their requirements to the Student Affairs Office until the end of the month.',
    type: 'info',
    targetAudience: ['students'],
    isPinned: false,
    expiresAt: daysFromNow(45),
  },
  {
    title: 'Welcome to the new academic year',
    message:
      'Welcome back, West Coast College community! We are excited to begin SY 2026-2027. Please check the portal regularly for updates on enrollment, schedules, and student activities.',
    type: 'info',
    targetAudience: ['all'],
    isPinned: false,
    expiresAt: null,
  },
];

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set');
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const admin = await Admin.findOne({ accountType: 'admin' }).sort({ createdAt: 1 });
  if (!admin) {
    throw new Error('No admin account found to attribute announcements to.');
  }

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Attributing announcements to: ${admin.displayName || admin.email || admin._id}`);

  if (REPLACE) {
    const titles = MOCK_ANNOUNCEMENTS.map((item) => item.title);
    if (APPLY) {
      const result = await Announcement.deleteMany({ title: { $in: titles } });
      console.log(`Removed ${result.deletedCount} existing mock announcement(s).`);
    } else {
      console.log(`Would remove existing announcements with ${titles.length} matching titles.`);
    }
  }

  console.log(`\n${APPLY ? 'Inserting' : 'Would insert'} ${MOCK_ANNOUNCEMENTS.length} announcements:`);

  for (const item of MOCK_ANNOUNCEMENTS) {
    const summary = `  - [${item.type}] ${item.title} → ${item.targetAudience.join(', ')}`;
    if (!APPLY) {
      console.log(summary);
      continue;
    }

    const announcement = new Announcement({
      ...item,
      createdBy: admin._id,
      isActive: true,
      isArchived: false,
    });
    await announcement.save();
    console.log(summary);
  }

  if (APPLY) {
    const total = await Announcement.countDocuments({});
    console.log(`\nDone. Announcements in database: ${total}`);
  } else {
    console.log('\nDry run complete. Re-run with --apply to insert.');
  }
}

main()
  .catch((error) => {
    console.error('\nSeed failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
