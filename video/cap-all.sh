#!/bin/zsh
# cap-all.sh : A2 plan-page capture, then the demo scenes, in one hold of the shared browser lock.
cd ./video
export PIN_FILE=~/.cache/qa-tab-tripwire-video CDP_PORT=9396
HELPER=$PWD/helper.js node rec.mjs https://tripwire-three.vercel.app/ work/runA2.json work 2>&1 | grep -E "CLIP|Error|unsettled"
node rec-scenes.mjs work/scenes-demo.json
