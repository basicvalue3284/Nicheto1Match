# PC Batch Runner

This folder runs the NicheTo1Match workflow from your computer without using the website UI.

## Folders

```text
pc_batch_runner/
  input_titles/      Drop Excel/CSV/TXT title files here
  output_results/    Batch results and ZIP files are written here
  run_batch.py       Runner script
```

## What It Does

For each file, one at a time:

1. Reads titles from Column A.
2. Runs Step 1 segregation.
3. Runs Step 2 title extraction and policy check.
4. Sends every SAFE extracted title to Step 3.
5. Writes review/error/risky/prohibited/pending rows separately.
6. Runs title scraping and subscriber fetch for 1-match titles.
7. Writes outputs and adds them to a final ZIP.

Step 3 only skips a file when Step 2 produces zero SAFE titles.

## Required Keys

Add these to the project `.env` file or your terminal environment:

```text
OPENAI_API_KEY=...
RAPIDAPI_KEY=...
```

If using Gemini for Step 2:

```text
AI_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-1.5-flash
```

## Run

From the project root:

```bash
.venv312/bin/python pc_batch_runner/run_batch.py
```

Test only Step 1 + Step 2 without RapidAPI:

```bash
.venv312/bin/python pc_batch_runner/run_batch.py --skip-step3
```

Validate file reading and Step 1 exports without any API calls:

```bash
.venv312/bin/python pc_batch_runner/run_batch.py --dry-run-step1
```

Use a custom folder:

```bash
.venv312/bin/python pc_batch_runner/run_batch.py --input-dir /path/to/files --output-dir /path/to/results
```

## Outputs Per File

```text
phase1_master.xlsx
review_rows.xlsx
safe_titles.csv
step3_master.xlsx
one_match_titles.csv
one_match_details.xlsx
summary.json
```

The full batch also creates:

```text
batch_summary.json
batch_YYYYMMDD....zip
```
