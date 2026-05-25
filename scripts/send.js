'use strict';

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// ── Environment ──────────────────────────────────────────────
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const TEST_MODE = process.env.TEST_MODE === 'true';

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  console.error('❌  Missing GMAIL_USER or GMAIL_APP_PASSWORD secrets.');
  console.error('    Go to: Settings → Secrets → Actions → New repository secret');
  process.exit(1);
}

// ── File paths ───────────────────────────────────────────────
const ROOT = path.join(__dirname, '..');
const CV_PATH = path.join(ROOT, 'cv', 'resume.pdf');
const COMPANIES_PATH = path.join(ROOT, 'data', 'companies.json');
const TEMPLATE_PATH = path.join(ROOT, 'data', 'template.txt');
const PROFILE_PATH = path.join(ROOT, 'data', 'profile.json');

// ── Validate files exist ──────────────────────────────────────
if (!fs.existsSync(CV_PATH)) {
  console.error('❌  CV not found at cv/resume.pdf');
  console.error('    Upload your CV via the dashboard first.');
  process.exit(1);
}
if (!fs.existsSync(COMPANIES_PATH)) {
  console.error('❌  data/companies.json not found');
  process.exit(1);
}
if (!fs.existsSync(TEMPLATE_PATH)) {
  console.error('❌  data/template.txt not found');
  process.exit(1);
}

// ── Load data ─────────────────────────────────────────────────
const companies = JSON.parse(fs.readFileSync(COMPANIES_PATH, 'utf8'));
const template  = fs.readFileSync(TEMPLATE_PATH, 'utf8');
const profile   = fs.existsSync(PROFILE_PATH)
  ? JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'))
  : { name: 'Applicant', subject: 'Internship Application' };

if (!companies.length) {
  console.log('⚠️   Company list is empty — nothing to send.');
  process.exit(0);
}

// ── Company name extractor ────────────────────────────────────
function extractCompanyName(email) {
  const domain = (email.split('@')[1] || '').toLowerCase();
  // Strip common prefixes like hr., jobs., careers., mail.
  const clean = domain.replace(
    /^(hr|jobs|careers|recruitment|talent|apply|mail|info|contact|noreply)\./i,
    ''
  );
  // Take the part before the TLD
  const parts = clean.split('.');
  const namePart = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  // Capitalise each hyphen-separated word
  return namePart
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ── Cover letter builder ──────────────────────────────────────
function buildCoverLetter(company) {
  const name = company.name || extractCompanyName(company.email);
  // Replace every occurrence of "your company" (case-insensitive)
  return template.replace(/\byour company\b/gi, name);
}

// ── Gmail transporter ─────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
});

// ── Send one application ──────────────────────────────────────
async function sendApplication(company) {
  const senderName = profile.name || 'Applicant';
  const subject    = profile.subject || `Internship Application – ${senderName}`;
  const body       = buildCoverLetter(company);
  const recipient  = TEST_MODE ? GMAIL_USER : company.email;

  await transporter.sendMail({
    from: `"${senderName}" <${GMAIL_USER}>`,
    to: recipient,
    subject,
    text: body,
    attachments: [
      {
        filename: `Resume_${senderName.replace(/\s+/g, '_')}.pdf`,
        path: CV_PATH,
      },
    ],
  });
}

// ── Sleep helper ──────────────────────────────────────────────
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// ── Main loop ─────────────────────────────────────────────────
async function main() {
  const pad = String(companies.length).length;

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║           📧  Auto Job Applicator                 ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  if (TEST_MODE) {
    console.log('🧪  TEST MODE  — All emails will be sent to YOU:', GMAIL_USER);
    console.log('    (Disable test mode when you are ready for real sending)\n');
  }

  console.log(`  Sender   : ${profile.name} <${GMAIL_USER}>`);
  console.log(`  Companies: ${companies.length}`);
  console.log(`  CV       : cv/resume.pdf`);
  console.log('──────────────────────────────────────────────────\n');

  let sent   = 0;
  let failed = 0;

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    const num = `[${String(i + 1).padStart(pad, '0')}/${companies.length}]`;

    try {
      await sendApplication(company);
      const name = company.name || extractCompanyName(company.email);
      console.log(`✅  ${num}  ${company.email}  →  ${name}`);
      sent++;
    } catch (err) {
      console.log(`❌  ${num}  ${company.email}  →  ${err.message}`);
      failed++;
    }

    // 1.5 s delay between sends to avoid Gmail rate limits
    if (i < companies.length - 1) {
      await sleep(1500);
    }
  }

  console.log('\n──────────────────────────────────────────────────');
  console.log(`  ✅ Sent  : ${sent}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  Total   : ${companies.length}`);
  console.log('──────────────────────────────────────────────────\n');

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('\n💥  Fatal error:', err.message);
  process.exit(1);
});
