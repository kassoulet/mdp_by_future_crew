#!/bin/bash
S=$(dirname "$(readlink -f "$0")")
export LD_LIBRARY_PATH=$S/dbx/usr/lib/x86_64-linux-gnu SDL_AUDIODRIVER=dummy
Xvfb :78 -screen 0 1024x768x24 >/dev/null 2>&1 & XV=$!; export DISPLAY=:78; sleep 1
$S/dbx/usr/bin/dosbox-x -conf $S/dbx.conf -fastlaunch -nogui -nomenu -time-limit 60 >$S/dbx.log 2>&1 & DB=$!
sleep 8; import -window root -crop 640x480+192+144 +repage $S/cap/j1_menu.png
xdotool key Down Down; sleep 2; import -window root -crop 640x480+192+144 +repage $S/cap/j1_menu2.png
xdotool key Return; sleep 12; import -window root -crop 640x480+192+144 +repage $S/cap/j1_play1.png
sleep 15; import -window root -crop 640x480+192+144 +repage $S/cap/j1_play2.png
kill $DB $XV
