#!/bin/bash
npx tsx server.ts > server.log 2>&1 &
PID=$!
sleep 10
kill $PID
cat server.log
