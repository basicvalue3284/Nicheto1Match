#!/bin/zsh
set -e

SCRIPT_DIR="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIR:h}"

cd "$PROJECT_ROOT"

clear
echo "Nicheto1Match AutoRUN - Dry Run Test"
echo ""
echo "This checks file reading and Step 1 exports without API calls."
echo ""

if [ ! -x ".venv312/bin/python" ]; then
  echo "Could not find .venv312/bin/python."
  echo "Open Terminal in the project folder and install dependencies first."
  echo ""
  read "?Press Enter to close..."
  exit 1
fi

".venv312/bin/python" "Nicheto1Match_AutoRUN/run_batch.py" --dry-run-step1

echo ""
echo "Dry run complete. Check the output_results folder."
open "$PROJECT_ROOT/Nicheto1Match_AutoRUN/output_results"
echo ""
read "?Press Enter to close..."
