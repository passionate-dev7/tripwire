#!/bin/zsh
# cap-pitch2.sh : caption PNGs and the pitch's seven motion scenes in one hold of the shared browser lock (exit 75 = lock busy, retry later).
cd ./video
export PIN_FILE=~/.cache/qa-tab-tripwire-video CDP_PORT=9396
node build-scenes.mjs
lockf -t 0 /tmp/deepsurge-rec.lock zsh -c 'node capbatch.mjs vo/pitch2/out/timings.json work2/caps-pitch2 && node rec-scenes2.mjs work2/scenes-pitch2.json'
