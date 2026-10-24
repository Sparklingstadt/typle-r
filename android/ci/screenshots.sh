#!/usr/bin/env bash
# Shows every page of the debug app with its sample data (DemoEntry.kt) on the running emulator and saves a
# screenshot of each into android/screenshots, to compare with the web app. Run it by hand.
set -euo pipefail
apk=android/app/build/outputs/apk/debug/app-debug.apk
package=io.github.sparklingstadt.typle
out=android/screenshots
mkdir -p "$out"
adb install -r "$apk"
# The slow CI emulator can make the launcher stop responding; keep its "isn't responding" dialog off the screenshots.
adb shell settings put global hide_error_dialogs 1
# The Pixel Tablet is landscape at rotation 0 (1280×800dp, the web's xl width) and portrait at rotation 1.
adb shell settings put system accelerometer_rotation 0
rotate() {
  adb shell settings put system user_rotation "$1"
  # Wait until the screen has turned (odd rotations are portrait): a fixed pause is too short on a slow emulator.
  local bytes width height
  for _ in $(seq 30); do
    read -r -a bytes < <(adb exec-out screencap -p | head -c 24 | tail -c 8 | od -An -tu1)
    width=$(((${bytes[0]:-0} << 24) | (${bytes[1]:-0} << 16) | (${bytes[2]:-0} << 8) | ${bytes[3]:-0}))
    height=$(((${bytes[4]:-0} << 24) | (${bytes[5]:-0} << 16) | (${bytes[6]:-0} << 8) | ${bytes[7]:-0}))
    if (((width < height) == ($1 % 2))); then break; fi
    sleep 1
  done
  sleep 2
  adb shell wm size
}
capture() { # name route language night [extra am arguments...]; settle=<seconds> waits longer before the screenshot
  local name=$1 route=$2 language=$3 night=$4
  shift 4
  adb shell am force-stop "$package"
  adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null || true
  adb shell cmd uimode night "$night" >/dev/null
  adb shell am start -W -n "$package/.MainActivity" --ez typleDemo true --es typleRoute "$route" --es typleLanguage "$language" "$@" >/dev/null
  sleep "${settle:-6}"
  adb exec-out screencap -p > "$out/$name.png"
}
rotate 0
for route in home practice records rankings lists createList editList general devices; do
  capture "$route" "$route" ja no
done
settle=15 capture typing-practice practice ja no --es typleTyping hogefx
settle=15 capture result-practice practice ja no --es typleTyping hogefoobar
capture detail-rankings rankings ja no --es typleRankingsList 8f3cf116-1f9f-4579-a071-e600094b104d
capture dark-practice practice ja yes
capture en-practice practice en no
rotate 1
capture portrait-practice practice ja no
ls -l "$out"
