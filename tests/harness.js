/* Minimal test harness.

Runs in the browser, where it renders results into the page, and in any other
JS runtime, where it prints them instead. Tests are synchronous and register
themselves as the module is imported; report() is called once afterwards.
*/

const results = [];
let currentSuite = '';

export function suite(name) {
  currentSuite = name;
}

export function test(name, fn) {
  try {
    fn();
    results.push({ suite: currentSuite, name, ok: true });
  } catch (err) {
    results.push({ suite: currentSuite, name, ok: false, message: err.message });
  }
}

export function assert(condition, message = 'assertion failed') {
  if (!condition) throw new Error(message);
}

export function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message} expected ${expected}, got ${actual}`.trim());
  }
}

export function assertClose(actual, expected, epsilon = 1e-4, message = '') {
  if (!(Math.abs(actual - expected) <= epsilon)) {
    throw new Error(`${message} expected ${expected} +/- ${epsilon}, got ${actual}`.trim());
  }
}

export function report() {
  const failed = results.filter((r) => !r.ok);
  const summary = `${results.length - failed.length}/${results.length} passed`;

  globalThis.__testResults = results;
  globalThis.__testsFailed = failed.length;

  if (typeof document === 'undefined') {
    for (const r of results) {
      if (!r.ok) console.log(`FAIL  ${r.suite}: ${r.name}\n      ${r.message}`);
    }
    console.log(summary);
    return;
  }

  const output = document.getElementById('results');
  const heading = document.getElementById('summary');
  heading.textContent = summary;
  heading.className = failed.length ? 'fail' : 'pass';

  let suiteName = null;
  for (const r of results) {
    if (r.suite !== suiteName) {
      suiteName = r.suite;
      const title = document.createElement('h2');
      title.textContent = suiteName;
      output.appendChild(title);
    }
    const row = document.createElement('div');
    row.className = r.ok ? 'case pass' : 'case fail';
    row.textContent = `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`;
    if (!r.ok) row.textContent += `\n      ${r.message}`;
    output.appendChild(row);
  }
}
