#!/bin/bash
cd /workspaces/stafferfi/apps/api
DATABASE_URL=postgresql://stafferfi:stafferfi_dev@localhost:5432/ecfr_analytics node dist/index.js
