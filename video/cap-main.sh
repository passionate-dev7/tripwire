#!/bin/zsh
# cap-main.sh : caption PNGs and the three motion scenes (chain read-back, enforcer, end card) in one hold of the shared browser lock.
cd ./video
export PIN_FILE=~/.cache/qa-tab-tripwire-video CDP_PORT=9396
node build-scenes.mjs
node plan-main.mjs ${1:-testnet} ${2:-tripwire-main-testnet} || exit 1
lockf /tmp/deepsurge-rec.lock zsh -c 'node capbatch.mjs vo/ms/out/timings.json work2/caps-main && node rec-scenes2.mjs work2/scenes-main.json'
