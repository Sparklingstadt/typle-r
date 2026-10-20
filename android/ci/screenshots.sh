#!/usr/bin/env bash
# Shows every page of the debug app with its sample data (DemoEntry.kt) on the running emulator and saves a
# screenshot of each into android/screenshots, to compare with the web app. Run by .github/workflows/android.yml.
set -euo pipefail
apk=android/app/build/outputs/apk/debug/app-debug.apk
package=io.github.sparklingstadt.typle
out=android/screenshots
mkdir -p "$out"
adb install -r "$apk"
# The Pixel Tablet is landscape at rotation 0 (1280×800dp, the web's xl width) and portrait at rotation 1.
adb shell settings put system accelerometer_rotation 0
rotate() {
  adb shell settings put system user_rotation "$1"
  sleep 2
  adb shell wm size
}
capture() { # name route language night [extra am arguments...]
  local name=$1 route=$2 language=$3 night=$4
  shift 4
  adb shell am force-stop "$package"
  adb shell cmd uimode night "$night" >/dev/null
  adb shell am start -W -n "$package/.MainActivity" --ez typleDemo true --es typleRoute "$route" --es typleLanguage "$language" "$@" >/dev/null
  sleep 6
  adb exec-out screencap -p > "$out/$name.png"
}
rotate 0
for route in home practice records rankings lists createList editList general devices; do
  capture "$route" "$route" ja no
done
capture typing-practice practice ja no --es typleTyping hogefx
capture result-practice practice ja no --es typleTyping hogefoobar
capture detail-rankings rankings ja no --es typleRankingsList sample-1
capture dark-practice practice ja yes
capture en-practice practice en no
rotate 1
capture portrait-practice practice ja no
ls -l "$out"
