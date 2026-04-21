#!/usr/bin/env node
/**
 * print-quality-badges.mjs
 *
 * After you activate Codacy and Code Climate (one-time OAuth signup with the
 * GitHub account that owns this repo), run this script with the project IDs
 * to print ready-to-paste markdown for the README badge block.
 *
 * Where to find the IDs:
 *   Codacy        — https://app.codacy.com/gh/<owner>/<repo>/settings → Integrations → Badges
 *                   (the "Grade" badge URL contains a UUID like `a1b2c3d4-...`)
 *   Code Climate  — https://codeclimate.com/github/<owner>/<repo>/badges
 *                   (the maintainability badge URL contains a hex token)
 *
 * Usage:
 *   node scripts/print-quality-badges.mjs --codacy <UUID> --codeclimate <TOKEN>
 *   node scripts/print-quality-badges.mjs --codacy <UUID>           # only Codacy
 *   node scripts/print-quality-badges.mjs --codeclimate <TOKEN>     # only Code Climate
 *
 * Optional:
 *   --repo <owner/repo>   Override (default: alimtvnetwork/macro-ahk-v21)
 *   --branch <name>       Branch for Codacy grade (default: main)
 *   --check               HEAD-fetch each emitted badge URL and report status
 *
 * Exit codes:
 *   0 — printed successfully
 *   1 — bad arguments
 *   2 — --check requested and at least one badge URL did not return 200
 */

const DEFAULT_REPO = "alimtvnetwork/macro-ahk-v21";
const DEFAULT_BRANCH = "main";

function parseArgs(argv) {
  const args = { codacy: "", codeclimate: "", repo: DEFAULT_REPO, branch: DEFAULT_BRANCH, check: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    switch (flag) {
      case "--codacy":      args.codacy = next ?? "";      i++; break;
      case "--codeclimate": args.codeclimate = next ?? ""; i++; break;
      case "--repo":        args.repo = next ?? DEFAULT_REPO;     i++; break;
      case "--branch":      args.branch = next ?? DEFAULT_BRANCH; i++; break;
      case "--check":       args.check = true; break;
      case "-h":
      case "--help":        printHelpAndExit(); break;
      default:
        console.error(`Unknown flag: ${flag}`);
        printHelpAndExit(1);
    }
  }
  return args;
}

function printHelpAndExit(code = 0) {
  console.error(
    "Usage: node scripts/print-quality-badges.mjs --codacy <UUID> --codeclimate <TOKEN> [--repo o/r] [--branch main] [--check]",
  );
  process.exit(code);
}

const UUID_RE  = /^[0-9a-fA-F-]{8,}$/;
const TOKEN_RE = /^[0-9a-fA-F]{8,}$/;

function validate(args) {
  if (!args.codacy && !args.codeclimate) {
    console.error("Provide at least one of --codacy <UUID> or --codeclimate <TOKEN>.");
    printHelpAndExit(1);
  }
  if (args.codacy && !UUID_RE.test(args.codacy)) {
    console.error(`--codacy '${args.codacy}' does not look like a Codacy project UUID.`);
    process.exit(1);
  }
  if (args.codeclimate && !TOKEN_RE.test(args.codeclimate)) {
    console.error(`--codeclimate '${args.codeclimate}' does not look like a Code Climate token (hex string).`);
    process.exit(1);
  }
}

function buildBadges({ codacy, codeclimate, repo, branch }) {
  const out = [];

  if (codacy) {
    const shieldsUrl = `https://img.shields.io/codacy/grade/${codacy}/${branch}?label=Codacy&logo=codacy&style=flat-square`;
    const linkUrl    = `https://app.codacy.com/gh/${repo}/dashboard`;
    out.push({
      label: "Codacy",
      shieldsUrl,
      linkUrl,
      markdown: `[![Codacy](${shieldsUrl})](${linkUrl})`,
    });
  }

  if (codeclimate) {
    const shieldsUrl = `https://img.shields.io/codeclimate/maintainability/${repo}?label=Code%20Climate&logo=codeclimate&logoColor=white&style=flat-square`;
    const apiBadgeUrl = `https://api.codeclimate.com/v1/badges/${codeclimate}/maintainability`;
    const linkUrl     = `https://codeclimate.com/github/${repo}/maintainability`;
    out.push({
      label: "Code Climate (Shields)",
      shieldsUrl,
      linkUrl,
      markdown: `[![Code Climate](${shieldsUrl})](${linkUrl})`,
    });
    out.push({
      label: "Code Climate (native API badge)",
      shieldsUrl: apiBadgeUrl,
      linkUrl,
      markdown: `[![Maintainability](${apiBadgeUrl})](${linkUrl})`,
    });
  }

  return out;
}

async function checkBadgeUrls(badges) {
  let allOk = true;
  console.log("\n## URL reachability\n");
  for (const b of badges) {
    try {
      const res = await fetch(b.shieldsUrl, { method: "HEAD" });
      const ok = res.ok;
      console.log(`  ${ok ? "✓" : "✗"} ${res.status}  ${b.label}`);
      if (!ok) allOk = false;
    } catch (err) {
      console.log(`  ✗ ERR  ${b.label} — ${err.message}`);
      allOk = false;
    }
  }
  return allOk;
}

function printReadmeBlock(badges) {
  console.log("## Paste-ready README block\n");
  console.log("Replace the placeholder 'activate' badges in `readme.md` with these lines:\n");
  console.log("```markdown");
  for (const b of badges) {
    console.log(b.markdown);
  }
  console.log("```\n");
}

function printIndividual(badges) {
  console.log("## Individual badge URLs\n");
  for (const b of badges) {
    console.log(`### ${b.label}`);
    console.log(`  Image:  ${b.shieldsUrl}`);
    console.log(`  Link:   ${b.linkUrl}\n`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  validate(args);

  const badges = buildBadges(args);

  console.log(`# Quality badges for ${args.repo}\n`);
  printReadmeBlock(badges);
  printIndividual(badges);

  if (args.check) {
    const ok = await checkBadgeUrls(badges);
    if (!ok) {
      console.error("\nOne or more badge URLs failed. Activation may still be pending — wait for the first analysis.");
      process.exit(2);
    }
    console.log("\nAll badge URLs reachable.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
