# Salary cleanup inventory — Phase 3

Scope: read-only inventory of files on the review branch. Nothing has been deleted.

| Path | Size (characters) | SHA | Disposition |
|---|---:|---|---|
| salary/index.html | 46707 | 779501c081d91c19043eb0762df307a3439df7c5 | Live entrypoint — keep |
| salary/app-part1.txt | 44863 | ed87e80f27e81a81faa66f3bd254591024ef8edf | Live bootstrap dependency — keep |
| salary/app-part2.txt | 54952 | 44d796874b67186551747b4a2841ff18770ad75c | Live bootstrap dependency — keep |
| salary/New/index.html | 47918 | 0349b66203ad396c30794abce51c2bfb68b80d57 | Different code; investigate references before removal |
| salary/New/app-part1.txt | 38999 | 6381b7a6c5911b861a9833955d62ebadd19fc559 | Different code; do not delete blindly |
| salary/New/app-part2.txt | 42590 | c527a90e01b139694ab4a8ecdd43e51a1bc0e9fe | Different code; do not delete blindly |

## Findings
- The `New` files are not byte-identical to the primary files. They cannot be treated as disposable duplicates without confirming traffic and links.
- The primary bootstrap fetches the two text files dynamically and executes them together. Renaming or removing either file currently breaks startup.
- The application loads `vendor/exceljs.min.js` before user requests export. Deferred loading is a candidate improvement, but requires checking `planner-excel.js` call sites and offline precache before changing the entrypoint.
- Several CSS and DOM-transform scripts overlap in responsibility. Removing them without a visual regression pass is unsafe.

## Phase 3 gate
Do not delete files or combine CSS/JS until all references, tests and deployed behavior are inventoried. A separate production-compatible change must demonstrate no changes in financial state or visible layout.
