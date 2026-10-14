#!/bin/zsh
cd ./video
export W=1280 H=720 DSF=1.5 PIN_FILE=~/.cache/qa-tab-tripwire-mera CDP_PORT=9396 VAUTH=1 HELPER=$PWD/mera/helper-mera.js
mkdir -p mera/take
lockf /tmp/deepsurge-rec.lock node rec.mjs "https://tripwire-three.vercel.app/" mera/steps.json mera/take > mera/take.out 2> mera/take.err
echo "exit $?" >> mera/take.err
