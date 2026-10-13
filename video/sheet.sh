#!/bin/zsh
# sheet.sh OUT COLS ids... : tile judge/<id>.png frames
out=$1; cols=$2; shift 2
args=(); for i in "$@"; do args+=(-i judge/$i.png); done
n=$#; rows=$(( (n + cols - 1) / cols ))
ffmpeg -y -loglevel error $args -filter_complex "$(for k in $(seq 0 $((n-1))); do printf "[$k:v]scale=960:540[a$k];"; done)$(for k in $(seq 0 $((n-1))); do printf "[a$k]"; done)xstack=inputs=$n:layout=$(for k in $(seq 0 $((n-1))); do printf "$(( (k % cols) * 960 ))_$(( (k / cols) * 540 ))|"; done | sed 's/|$//')" -frames:v 1 $out
