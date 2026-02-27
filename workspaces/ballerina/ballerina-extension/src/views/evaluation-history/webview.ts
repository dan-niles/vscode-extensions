/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { Disposable, Uri, ViewColumn, WebviewPanel, window } from "vscode";
import * as fs from "fs";
import * as path from "path";
import { EvaluationReportWebview } from "../evaluation-report/webview";

// ── Types ────────────────────────────────────────────────────────────────────

interface OutcomeResult {
  id: string;
  passed: boolean;
  errorMessage?: string;
}

interface EvaluationRun {
  id: number;
  passRate: number;
  outcomes: OutcomeResult[];
}

interface RunDataPoint {
  date: Date;
  passRate: number;
  targetPassRate: number;
  status: "PASSED" | "FAILURE";
  evaluationRuns: EvaluationRun[];
  htmlReportPath: string | undefined;
  failureMessage: string | undefined;
}

interface TestHistory {
  testName: string;
  runs: RunDataPoint[]; // sorted ascending by date
  projectName: string;
}

interface AggregatedData {
  tests: TestHistory[];
  totalRunFiles: number;
  projectNames: string[];
}

// ── Date parsing ─────────────────────────────────────────────────────────────

/** Parse date from filename like `2026-02-26_04-35-21-670_test_results.json` */
function parseDateFromFilename(filename: string): Date | undefined {
  const match = filename.match(
    /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})-(\d{3})/
  );
  if (!match) {
    return undefined;
  }
  const [, year, month, day, hour, minute, second, ms] = match;
  return new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour),
    parseInt(minute),
    parseInt(second),
    parseInt(ms)
  );
}

/** Format a Date for display */
function formatDate(d: Date): string {
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Data loading ──────────────────────────────────────────────────────────────

function loadReportData(reportsDir: string): AggregatedData {
  const testMap = new Map<string, TestHistory>();
  const projectNames = new Set<string>();
  let totalRunFiles = 0;

  if (!fs.existsSync(reportsDir)) {
    return { tests: [], totalRunFiles: 0, projectNames: [] };
  }

  const files = fs.readdirSync(reportsDir);
  const jsonFiles = files
    .filter((f) => f.endsWith("_test_results.json"))
    .sort(); // alphabetical ≈ chronological given the timestamp prefix

  for (const jsonFile of jsonFiles) {
    const date = parseDateFromFilename(jsonFile);
    if (!date) {
      continue;
    }

    let jsonData: any;
    try {
      jsonData = JSON.parse(
        fs.readFileSync(path.join(reportsDir, jsonFile), "utf-8")
      );
    } catch {
      continue;
    }

    totalRunFiles++;

    // Find corresponding HTML report (same timestamp prefix)
    const tsPrefix = jsonFile.replace(/_test_results\.json$/, "");
    const htmlFile = files.find(
      (f) => f.startsWith(tsPrefix) && f.endsWith(".html")
    );
    const htmlReportPath = htmlFile
      ? path.join(reportsDir, htmlFile)
      : undefined;

    const projectName: string = jsonData.projectName ?? "Unknown";
    projectNames.add(projectName);

    const moduleStatus: any[] = jsonData.moduleStatus ?? [];
    for (const mod of moduleStatus) {
      const tests: any[] = mod.tests ?? [];
      for (const test of tests) {
        if (!test.isEvaluation) {
          continue;
        }

        const testName: string = test.name;
        const status: "PASSED" | "FAILURE" =
          test.status === "PASSED" ? "PASSED" : "FAILURE";

        const evalSummary = test.evaluationSummary ?? {};
        const observedPassRate: number =
          typeof evalSummary.observedPassRate === "number"
            ? evalSummary.observedPassRate
            : 0;
        const targetPassRate: number =
          typeof evalSummary.targetPassRate === "number"
            ? evalSummary.targetPassRate
            : 0.8;

        const evaluationRuns: EvaluationRun[] = (
          evalSummary.evaluationRuns ?? []
        ).map((r: any) => ({
          id: r.id,
          passRate: r.passRate ?? 0,
          outcomes: (r.outcomes ?? []).map((o: any) => ({
            id: o.id,
            passed: !o.errorMessage,
            errorMessage: o.errorMessage,
          })),
        }));

        const run: RunDataPoint = {
          date,
          passRate: observedPassRate,
          targetPassRate,
          status,
          evaluationRuns,
          htmlReportPath,
          failureMessage: test.failureMessage,
        };

        if (!testMap.has(testName)) {
          testMap.set(testName, {
            testName,
            runs: [],
            projectName,
          });
        }
        testMap.get(testName)!.runs.push(run);
      }
    }
  }

  // Sort runs ascending within each test
  const tests = Array.from(testMap.values());
  for (const t of tests) {
    t.runs.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  return {
    tests,
    totalRunFiles,
    projectNames: Array.from(projectNames),
  };
}

// ── Sparkline container (rendered client-side to get real pixel dimensions) ───

function buildSparklineContainer(runs: RunDataPoint[]): string {
  const runsData = runs.map((r) => ({
    date: formatDate(r.date),
    passRate: r.passRate,
    targetPassRate: r.targetPassRate,
    status: r.status,
    outcomes: r.evaluationRuns.reduce(
      (acc, er) => acc + er.outcomes.length, 0
    ),
    passed: r.evaluationRuns.reduce(
      (acc, er) => acc + er.outcomes.filter((o) => o.passed).length, 0
    ),
  }));
  return `<div class="sparkline-container" data-runs="${escapeHtml(JSON.stringify(runsData))}"></div>`;
}

// ── Run table row ─────────────────────────────────────────────────────────────

function buildRunRow(run: RunDataPoint, _index: number): string {
  const pct = (run.passRate * 100).toFixed(0);
  const targetPct = (run.targetPassRate * 100).toFixed(0);
  const isPassed = run.status === "PASSED";
  const statusClass = isPassed ? "status-pass" : "status-fail";
  const statusLabel = isPassed ? "Passed" : "Failed";

  const viewBtn = run.htmlReportPath
    ? `<button class="view-btn" data-report-path="${escapeHtml(run.htmlReportPath)}">View Report</button>`
    : `<span class="no-report">—</span>`;

  // Outcomes summary per evaluationRun
  const outcomesHtml = run.evaluationRuns
    .map((er) => {
      const passedCount = er.outcomes.filter((o) => o.passed).length;
      const totalCount = er.outcomes.length;
      const outcomePills = er.outcomes
        .map((o) => {
          const cls = o.passed ? "outcome-pass" : "outcome-fail";
          return `<span class="outcome-pill ${cls}" title="${o.passed ? "Passed" : o.errorMessage?.substring(0, 120) ?? "Failed"}">${o.id}</span>`;
        })
        .join("");
      return `<div class="eval-run-outcomes">
              <span class="eval-run-label">Run ${er.id}</span>
              <span class="outcomes-rate">${passedCount}/${totalCount}</span>
              <div class="outcomes-pills">${outcomePills}</div>
            </div>`;
    })
    .join("");

  return `<tr class="run-row ${isPassed ? "run-pass" : "run-fail"}">
      <td class="run-date">${formatDate(run.date)}</td>
      <td class="run-rate">
        <span class="rate-badge ${isPassed ? "rate-pass" : "rate-fail"}">${pct}%</span>
        <span class="rate-target">/ ${targetPct}%</span>
      </td>
      <td><span class="status-chip ${statusClass}">${statusLabel}</span></td>
      <td class="outcomes-cell">
        <details>
          <summary class="outcomes-summary">${run.evaluationRuns.reduce((s, r) => s + r.outcomes.length, 0)} outcomes</summary>
          ${outcomesHtml}
        </details>
      </td>
      <td>${viewBtn}</td>
    </tr>`;
}

// ── Test card ─────────────────────────────────────────────────────────────────

function buildTestCard(history: TestHistory, cardIndex: number): string {
  const latest = history.runs[history.runs.length - 1];
  const latestPct = (latest.passRate * 100).toFixed(0);
  const targetPct = (latest.targetPassRate * 100).toFixed(0);
  const isPassing = latest.passRate >= latest.targetPassRate;

  const sparkline = buildSparklineContainer(history.runs);
  const rows = history.runs
    .slice()
    .reverse() // newest first
    .map((r, i) => buildRunRow(r, i))
    .join("\n");

  // Trend indicator
  let trendHtml = "";
  if (history.runs.length >= 2) {
    const prev = history.runs[history.runs.length - 2].passRate;
    const diff = latest.passRate - prev;
    if (Math.abs(diff) > 0.001) {
      const arrow = diff > 0 ? "↑" : "↓";
      const cls = diff > 0 ? "trend-up" : "trend-down";
      trendHtml = `<span class="trend ${cls}">${arrow} ${Math.abs(diff * 100).toFixed(0)}%</span>`;
    } else {
      trendHtml = `<span class="trend trend-flat">→ stable</span>`;
    }
  }

  return `<section class="test-card" id="test-${cardIndex}">
    <div class="card-header">
      <div class="card-title-row">
        <h2 class="test-name">${escapeHtml(history.testName)}</h2>
        <div class="card-badges">
          ${trendHtml}
          <span class="pass-badge ${isPassing ? "badge-pass" : "badge-fail"}">
            ${latestPct}% <span class="badge-sep">/</span> ${targetPct}%
          </span>
        </div>
      </div>
      <div class="card-meta">${history.runs.length} run${history.runs.length !== 1 ? "s" : ""} · ${escapeHtml(history.projectName)}</div>
    </div>

    <div class="sparkline-wrap">
      <div class="sparkline-labels">
        <span>100%</span>
        <span>0%</span>
      </div>
      ${sparkline}
    </div>

    <details class="runs-details" ${history.runs.length <= 3 ? "open" : ""}>
      <summary class="runs-summary">
        <span class="runs-summary-label">Run history</span>
        <span class="runs-summary-count">${history.runs.length} entries</span>
      </summary>
      <div class="table-wrap">
        <table class="runs-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Pass Rate</th>
              <th>Status</th>
              <th>Outcomes</th>
              <th>Report</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </details>
  </section>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Full HTML page ────────────────────────────────────────────────────────────

function generateHtml(data: AggregatedData): string {
  const projectLabel = data.projectNames.join(", ") || "Unknown";

  const cardsHtml =
    data.tests.length > 0
      ? data.tests.map((t, i) => buildTestCard(t, i)).join("\n")
      : `<div class="empty-state">
        <div class="empty-icon">📊</div>
        <p class="empty-title">No evaluation results found</p>
        <p class="empty-sub">Run an evaluation test to see history here.</p>
      </div>`;

  const overallPassCount = data.tests.filter((t) => {
    const latest = t.runs[t.runs.length - 1];
    return latest && latest.status === "PASSED";
  }).length;

  const summaryHtml =
    data.tests.length > 0
      ? `<div class="summary-bar">
        <div class="summary-stat">
          <span class="stat-value">${data.totalRunFiles}</span>
          <span class="stat-label">total runs</span>
        </div>
        <div class="summary-divider"></div>
        <div class="summary-stat">
          <span class="stat-value">${data.tests.length}</span>
          <span class="stat-label">evaluation tests</span>
        </div>
        <div class="summary-divider"></div>
        <div class="summary-stat">
          <span class="stat-value stat-pass">${overallPassCount}</span>
          <span class="stat-label">currently passing</span>
        </div>
        <div class="summary-divider"></div>
        <div class="summary-stat">
          <span class="stat-value stat-fail">${data.tests.length - overallPassCount}</span>
          <span class="stat-label">currently failing</span>
        </div>
      </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Evaluation History</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      font-size: var(--vscode-font-size, 13px);
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      padding: 24px;
      min-height: 100vh;
    }

    /* ── Header ── */
    .page-header {
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .page-title {
      font-size: 20px;
      font-weight: 600;
      color: var(--vscode-editor-foreground);
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 4px;
    }
    .page-title-icon { font-size: 18px; }
    .page-subtitle {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    /* ── Summary bar ── */
    .summary-bar {
      display: flex;
      align-items: center;
      gap: 0;
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 12px 20px;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 0;
    }
    .summary-stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0 20px;
      gap: 2px;
    }
    .stat-value {
      font-size: 22px;
      font-weight: 700;
      line-height: 1;
      color: var(--vscode-editor-foreground);
    }
    .stat-label {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      white-space: nowrap;
    }
    .stat-pass { color: var(--vscode-testing-iconPassed, #4caf50); }
    .stat-fail { color: var(--vscode-testing-iconFailed, #f44336); }
    .summary-divider {
      width: 1px;
      height: 36px;
      background: var(--vscode-panel-border);
    }

    /* ── Test card ── */
    .test-card {
      background: var(--vscode-sideBar-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      margin-bottom: 16px;
      overflow: hidden;
    }
    .card-header {
      padding: 14px 18px 10px;
    }
    .card-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 4px;
    }
    .test-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-editor-font-family, monospace);
    }
    .card-badges {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .card-meta {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    /* ── Pass badge ── */
    .pass-badge {
      font-size: 12px;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 12px;
    }
    .badge-pass {
      background: rgba(76, 175, 80, 0.15);
      color: var(--vscode-testing-iconPassed, #4caf50);
      border: 1px solid rgba(76, 175, 80, 0.3);
    }
    .badge-fail {
      background: rgba(244, 67, 54, 0.12);
      color: var(--vscode-testing-iconFailed, #f44336);
      border: 1px solid rgba(244, 67, 54, 0.3);
    }
    .badge-sep { opacity: 0.5; margin: 0 2px; font-weight: 400; }

    /* ── Trend ── */
    .trend {
      font-size: 12px;
      font-weight: 600;
    }
    .trend-up { color: var(--vscode-testing-iconPassed, #4caf50); }
    .trend-down { color: var(--vscode-testing-iconFailed, #f44336); }
    .trend-flat { color: var(--vscode-descriptionForeground); font-weight: 400; }

    /* ── Sparkline ── */
    .sparkline-wrap {
      display: flex;
      align-items: stretch;
      gap: 0;
      padding: 0 18px 4px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .sparkline-labels {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      padding: 6px 8px 6px 0;
      white-space: nowrap;
      min-width: 60px;
      text-align: right;
    }
    .sparkline-container {
      flex: 1;
      height: 90px;
      min-width: 0;
    }
    .sparkline-container svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .spark-dot {
      cursor: pointer;
      transition: r 0.1s;
    }
    .spark-dot:hover { r: 6; }
    .dot-pass { fill: var(--vscode-testing-iconPassed, #4caf50); }
    .dot-fail { fill: var(--vscode-testing-iconFailed, #f44336); }

    /* ── Sparkline tooltip ── */
    #spark-tooltip {
      display: none;
      position: fixed;
      z-index: 9999;
      pointer-events: none;
      background: var(--vscode-editorHoverWidget-background, #252526);
      border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 12px;
      line-height: 1.6;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      max-width: 220px;
    }
    .tt-date {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
    }
    .tt-rate {
      font-size: 15px;
      font-weight: 700;
      margin-bottom: 2px;
    }
    .tt-pass { color: var(--vscode-testing-iconPassed, #4caf50); }
    .tt-fail { color: var(--vscode-testing-iconFailed, #f44336); }
    .tt-sep { opacity: 0.4; margin: 0 3px; font-weight: 400; font-size: 12px; }
    .tt-target { font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
    .tt-status { font-size: 11px; font-weight: 600; }
    .tt-outcomes { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 2px; }

    /* ── Runs details ── */
    .runs-details {
      border-top: none;
    }
    .runs-summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 18px;
      cursor: pointer;
      user-select: none;
      list-style: none;
      gap: 8px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    .runs-summary::-webkit-details-marker { display: none; }
    .runs-summary::before {
      content: '›';
      display: inline-block;
      transition: transform 0.15s;
      margin-right: 6px;
      font-size: 14px;
      color: var(--vscode-descriptionForeground);
    }
    details[open] .runs-summary::before { transform: rotate(90deg); }
    .runs-summary:hover { background: var(--vscode-list-hoverBackground); }
    .runs-summary-label { font-weight: 500; color: var(--vscode-editor-foreground); }
    .runs-summary-count { margin-left: auto; }

    /* ── Runs table ── */
    .table-wrap { overflow-x: auto; }
    .runs-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .runs-table th {
      text-align: left;
      padding: 8px 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .runs-table td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      vertical-align: top;
    }
    .runs-table tr:last-child td { border-bottom: none; }
    .runs-table tr:hover td { background: var(--vscode-list-hoverBackground); }
    .run-date { color: var(--vscode-descriptionForeground); white-space: nowrap; }

    /* Rate badge in table */
    .rate-badge {
      font-weight: 600;
      font-size: 12px;
    }
    .rate-pass { color: var(--vscode-testing-iconPassed, #4caf50); }
    .rate-fail { color: var(--vscode-testing-iconFailed, #f44336); }
    .rate-target { color: var(--vscode-descriptionForeground); font-size: 11px; }

    /* Status chip */
    .status-chip {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 10px;
      white-space: nowrap;
    }
    .status-pass {
      background: rgba(76, 175, 80, 0.15);
      color: var(--vscode-testing-iconPassed, #4caf50);
    }
    .status-fail {
      background: rgba(244, 67, 54, 0.12);
      color: var(--vscode-testing-iconFailed, #f44336);
    }

    /* Outcomes */
    .outcomes-cell { max-width: 360px; }
    .outcomes-summary {
      cursor: pointer;
      list-style: none;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
    }
    .outcomes-summary::-webkit-details-marker { display: none; }
    .eval-run-outcomes {
      margin-top: 6px;
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 4px;
    }
    .eval-run-label {
      font-size: 10px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
      margin-right: 4px;
      white-space: nowrap;
    }
    .outcomes-rate {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
    }
    .outcomes-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
      margin-top: 4px;
      width: 100%;
    }
    .outcome-pill {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 8px;
      cursor: default;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .outcome-pass {
      background: rgba(76, 175, 80, 0.15);
      color: var(--vscode-testing-iconPassed, #4caf50);
      border: 1px solid rgba(76, 175, 80, 0.25);
    }
    .outcome-fail {
      background: rgba(244, 67, 54, 0.1);
      color: var(--vscode-testing-iconFailed, #f44336);
      border: 1px solid rgba(244, 67, 54, 0.25);
    }

    /* View report button */
    .view-btn {
      font-size: 11px;
      padding: 3px 10px;
      border-radius: 4px;
      border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
      background: var(--vscode-button-secondaryBackground, transparent);
      color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
      cursor: pointer;
      white-space: nowrap;
    }
    .view-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground));
    }
    .no-report { color: var(--vscode-descriptionForeground); }

    /* ── Empty state ── */
    .empty-state {
      text-align: center;
      padding: 64px 24px;
      color: var(--vscode-descriptionForeground);
    }
    .empty-icon { font-size: 40px; margin-bottom: 16px; }
    .empty-title { font-size: 15px; font-weight: 600; margin-bottom: 8px; color: var(--vscode-editor-foreground); }
    .empty-sub { font-size: 13px; }
  </style>
</head>
<body>
  <header class="page-header">
    <div class="page-title">
      Evaluation History
    </div>
    <div class="page-subtitle">Project: ${escapeHtml(projectLabel)}</div>
  </header>

  ${summaryHtml}

  <div class="test-list">
    ${cardsHtml}
  </div>

  <div id="spark-tooltip"></div>

  <script>
    const vscode = acquireVsCodeApi();

    // ── View Report button ──────────────────────────────────────────────────
    document.addEventListener('click', function(e) {
      const btn = e.target.closest('.view-btn');
      if (btn) {
        const reportPath = btn.dataset.reportPath;
        if (reportPath) {
          vscode.postMessage({ type: 'openReport', path: reportPath });
        }
      }
    });

    // ── Sparkline rendering ─────────────────────────────────────────────────
    const PAD_X = 16;
    const PAD_Y = 12;
    const DOT_R = 4.5;
    const H = 90;

    function renderSparklines() {
      document.querySelectorAll('.sparkline-container').forEach(function(container) {
        const runs = JSON.parse(container.dataset.runs || '[]');
        if (!runs.length) return;

        const W = container.clientWidth || 400;
        const target = runs[0].targetPassRate;

        function scaleX(i) {
          return runs.length === 1
            ? W / 2
            : PAD_X + (i / (runs.length - 1)) * (W - PAD_X * 2);
        }
        function scaleY(v) {
          return PAD_Y + (1 - v) * (H - PAD_Y * 2);
        }

        const ty = scaleY(target).toFixed(1);
        const pts = runs.map(function(r, i) {
          return scaleX(i).toFixed(1) + ',' + scaleY(r.passRate).toFixed(1);
        }).join(' ');
        const areaPts = pts
          + ' ' + scaleX(runs.length - 1).toFixed(1) + ',' + (H - PAD_Y).toFixed(1)
          + ' ' + PAD_X + ',' + (H - PAD_Y).toFixed(1);

        const gradId = 'g' + Math.random().toString(36).slice(2);

        const dotsSvg = runs.map(function(r, i) {
          const cx = scaleX(i).toFixed(1);
          const cy = scaleY(r.passRate).toFixed(1);
          const cls = r.passRate >= r.targetPassRate ? 'dot-pass' : 'dot-fail';
          return '<circle cx="' + cx + '" cy="' + cy + '" r="' + DOT_R + '" class="spark-dot ' + cls + '" data-idx="' + i + '"/>';
        }).join('');

        const targetPct = Math.round(target * 100);
        const targetLabelY = (parseFloat(ty) - 4).toFixed(1);

        container.innerHTML =
          '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">' +
          '<defs><linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="var(--vscode-charts-blue)" stop-opacity="0.25"/>' +
          '<stop offset="100%" stop-color="var(--vscode-charts-blue)" stop-opacity="0"/>' +
          '</linearGradient></defs>' +
          '<polygon points="' + areaPts + '" fill="url(#' + gradId + ')"/>' +
          '<line x1="' + PAD_X + '" y1="' + ty + '" x2="' + (W - PAD_X) + '" y2="' + ty + '"' +
          ' stroke="var(--vscode-charts-orange)" stroke-width="1.5" stroke-dasharray="5,4" opacity="0.8"/>' +
          '<text x="' + PAD_X + '" y="' + targetLabelY + '" font-size="9"' +
          ' fill="var(--vscode-charts-orange)" opacity="0.85">' + targetPct + '% target</text>' +
          '<polyline points="' + pts + '" fill="none"' +
          ' stroke="var(--vscode-charts-blue)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
          dotsSvg +
          '</svg>';

        // Attach tooltip events to each dot
        container.querySelectorAll('.spark-dot').forEach(function(dot) {
          dot.addEventListener('mouseenter', function(e) { showTooltip(e, runs[parseInt(dot.dataset.idx)]); });
          dot.addEventListener('mousemove', moveTooltip);
          dot.addEventListener('mouseleave', hideTooltip);
        });
      });
    }

    // ── Tooltip ─────────────────────────────────────────────────────────────
    const tooltip = document.getElementById('spark-tooltip');

    function showTooltip(e, run) {
      const pct = (run.passRate * 100).toFixed(0);
      const targetPct = (run.targetPassRate * 100).toFixed(0);
      const isPassed = run.passRate >= run.targetPassRate;
      const statusIcon = isPassed ? '✓' : '✗';
      const statusLabel = isPassed ? 'Passed' : 'Failed';
      tooltip.innerHTML =
        '<div class="tt-date">' + run.date + '</div>' +
        '<div class="tt-rate ' + (isPassed ? 'tt-pass' : 'tt-fail') + '">' +
          pct + '%<span class="tt-sep">/</span>' + targetPct + '% target' +
        '</div>' +
        '<div class="tt-status ' + (isPassed ? 'tt-pass' : 'tt-fail') + '">' + statusIcon + ' ' + statusLabel + '</div>' +
        '<div class="tt-outcomes">' + run.passed + ' / ' + run.outcomes + ' outcomes passed</div>';
      tooltip.style.display = 'block';
      moveTooltip(e);
    }

    function moveTooltip(e) {
      const tw = tooltip.offsetWidth;
      const th = tooltip.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let x = e.clientX + 14;
      let y = e.clientY - 10;
      if (x + tw > vw - 8) { x = e.clientX - tw - 14; }
      if (y + th > vh - 8) { y = e.clientY - th + 10; }
      tooltip.style.left = x + 'px';
      tooltip.style.top = y + 'px';
    }

    function hideTooltip() {
      tooltip.style.display = 'none';
    }

    // Render after layout so clientWidth is available
    requestAnimationFrame(renderSparklines);
  </script>
</body>
</html>`;
}

// ── Webview class ─────────────────────────────────────────────────────────────

export class EvaluationHistoryWebview {
  public static currentPanel: EvaluationHistoryWebview | undefined;
  private _panel: WebviewPanel;
  private _disposables: Disposable[] = [];

  private constructor(panel: WebviewPanel) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        if (message.type === "openReport") {
          const reportUri = Uri.file(message.path);
          try {
            await EvaluationReportWebview.createOrShow(reportUri);
          } catch (error) {
            window.showErrorMessage(
              `Failed to open evaluation report: ${error}`
            );
          }
        }
      },
      null,
      this._disposables
    );
  }

  public static async createOrShow(workspaceRoot: string): Promise<void> {
    const reportsDir = path.join(workspaceRoot, "evaluation-reports");
    const data = loadReportData(reportsDir);

    if (EvaluationHistoryWebview.currentPanel) {
      EvaluationHistoryWebview.currentPanel._panel.reveal(
        ViewColumn.Active
      );
      EvaluationHistoryWebview.currentPanel._panel.webview.html =
        generateHtml(data);
      return;
    }

    const panel = window.createWebviewPanel(
      "ballerinaEvaluationHistory",
      "Evaluation History",
      ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    EvaluationHistoryWebview.currentPanel = new EvaluationHistoryWebview(
      panel
    );
    EvaluationHistoryWebview.currentPanel._panel.webview.html =
      generateHtml(data);
  }

  public dispose(): void {
    EvaluationHistoryWebview.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) {
        d.dispose();
      }
    }
  }
}
