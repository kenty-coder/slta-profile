#!/bin/bash
# 音声ファイルの前後の余分な無音を切りそろえます（要 ffmpeg）。作成者: KENTA SHINKAWA
# 使い方: bash tools/trim-silence.sh   （generate-audio.mjs で音声を作ったあとに実行）
set -e
cd "$(dirname "$0")/.."
F='silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,apad=pad_dur=0.12'
find audio -name '*.mp3' | while read -r f; do
  ffmpeg -nostdin -loglevel error -y -i "$f" -af "$F" -ar 24000 -ac 1 -b:a 96k "$f.tmp.mp3" && mv "$f.tmp.mp3" "$f"
done
echo "終わりました。"
