# Workspace tools

The tool desktop contains Date, PDF, Lying-flat calculator, and Random picker apps. Tools use the existing workspace theme and do not store their inputs or files in the workspace cloud document. State remains in this browser tab until reloaded. PDF libraries and their worker are served with the site and loaded on demand.

## Lying-flat calculator

Inputs: available capital, monthly/yearly expenses, nominal annual return, and annual inflation. Switching the expense period converts the existing value. The model uses real return `(1 + return) / (1 + inflation) - 1` and subtracts annual expenses at year end, with a proportional final year. It plots balances in today's purchasing power. Defaults are editable scenario assumptions, not quoted financial product rates.

The 8 × 9 quick table uses the same calculation as the main result. Cells refill the input values. The PNG export is produced locally with a canvas. Strict sustainability is shown as `∞`; savings that survive the 100-year simulation but are not sustainable are shown as `100+`.

Reference for the requested tool: https://www.toolbox365.cn/tools/lying-flat/

## Random picker

The default tab is jiaobei. Two independent 50/50 faces give one flat/one rounded (圣筊), two flat (笑筊), or two rounded (阴筊). This is a random simulation, not a physical probability model. Mapping reference: https://tcmb.culture.tw/zh-tw/detail?id=17120007177&indexCode=MOCCOLLECTIONS

The wheel allows up to 32 equally likely options. The draw allows up to 200 options and supports batch draws without replacement within a batch, plus optional removal between draws. Empty lines and duplicate labels are normalized. Browser cryptographic randomness uses rejection sampling to avoid modulo bias. Animations respect reduced-motion preferences and cancel on leaving an app.

## Verification

- `npm test`: calculation edge cases, random sampling, jiaobei combinations, and existing workspace regressions.
- `npm run test:tools`: isolated browser test against `tests/tool-preview.html`; requires Microsoft Edge, uses generated fixture files, and does not access a real workspace account. Validates document exports, calculator conversion and PNG download, wheel landing, no-repeat draws, jiaobei, mobile/dark layout, and absence of external processing requests.
- `npm run build`: produces the production site. Test pages and screenshots are not part of the published site.
