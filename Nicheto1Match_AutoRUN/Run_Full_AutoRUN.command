#!/bin/zsh
set -e

SCRIPT_DIR="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIR:h}"

cd "$PROJECT_ROOT"

clear
echo "Nicheto1Match AutoRUN"
echo "Project: $PROJECT_ROOT"
echo ""
echo "Input folder:"
echo "$PROJECT_ROOT/Nicheto1Match_AutoRUN/input_titles"
echo ""
echo "Output folder:"
echo "$PROJECT_ROOT/Nicheto1Match_AutoRUN/output_results"
echo ""

if [ ! -x ".venv312/bin/python" ]; then
  echo "Could not find .venv312/bin/python."
  echo "Open Terminal in the project folder and install dependencies first."
  echo ""
  read "?Press Enter to close..."
  exit 1
fi

echo "Starting full automation..."
echo ""
".venv312/bin/python" "Nicheto1Match_AutoRUN/run_batch.py"

echo ""
echo "Done. Check the output_results folder."
open "$PROJECT_ROOT/Nicheto1Match_AutoRUN/output_results"
echo ""
read "?Press Enter to close..."
