#!/bin/zsh
# run-take.sh NET : one full holder run in the pinned tab under the shared recording lock.
cd ./video
NET=$1
export W=1280 H=720 DSF=1.5 PIN_FILE=~/.cache/qa-tab-tripwire-video CDP_PORT=9396 VAUTH=1 HELPER=$PWD/helper.js
URL="https://tripwire-three.vercel.app/"; [[ $NET == mainnet ]] && URL="https://tripwire-three.vercel.app/?net=mainnet"
mkdir -p work2/$NET
lockf /tmp/deepsurge-rec.lock node rec.mjs "$URL" work2/steps-$NET.json work2/$NET > work2/$NET.out 2> work2/$NET.err
echo "exit $?" >> work2/$NET.err
