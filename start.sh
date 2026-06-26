#!/bin/bash
set -e

# checks if virtual env exists and activates it
if [ -d ".venv" ]; then
    source .venv/bin/activate
fi

# install dependencies
pip install -r requirements.txt

# runs app
python app.py