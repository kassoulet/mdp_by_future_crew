# MDP — MusicDiscPlayer, JavaScript port

A pixel-exact browser recreation of **MDP.EXE**, the S3M/MOD player and music-disk engine by
**Future Crew** (1993). One site, a launcher to pick the disc, then the original menu and playing screen
at the original 640x480.

| Disc | Player | Content |
|------|--------|---------|
| `journey1` | MDP v1.0 | Journey I, Purple Motion |
| `journey2` | MDP v1.0 | Journey II, Purple Motion |
| `chmind` | MDP v1.1 | Chaotic Mind, Skaven (adds `+`/`-` volume, `S` mono/stereo) |

The original files stay untouched in their folders.

## Run

```sh
tools/build.sh dist && python3 -m http.server -d dist 8000
```

Open <http://localhost:8000/>. Pushes to `main` deploy to GitHub Pages (`.github/workflows/pages.yml`).

Mouse: wheel scrolls the menu (volume on the playing screen, with Shift: order), click selects then plays, click the progress bar to seek, click "ESC for menu" / "F10 for dos". Back button or Backspace: playing screen to menu, menu to launcher.

Keys: arrows / PgUp / PgDn and Enter in the menu; Esc switches between menu and playing screen, F10 leaves;
Left/Right change order; `+`/`-` volume and `S` stereo on Chaotic Mind; Space pauses. Under the canvas: pause,
seek bar and one Modern / Old-school switch (sharp scaling + hi-fi sound, or exact pixels + 22 kHz 8-bit sound).

## How faithful is it

- **Menu and screens:** ported line by line from the original assembly onto a 4-plane framebuffer, so pixels
  match. The menu is checked on every vsync frame against the original code running in an emulator
  (`tools/oracle.py`, `tools/tests/menu_vs_oracle.mjs`). The v1.1 menu and the playing screen's static parts match
  DOSBox-X captures with 0 differing pixels.
- **Audio:** libopenmpt (WebAssembly). Hi-fi: sinc interpolation. Old-school: 22.05 kHz, no interpolation, 8-bit.
- **Not exact:** in Modern mode the markers are shifted up (3 octaves, no pile-up on the bottom row); Old-school keeps the original placement. The coloured note markers are rebuilt from pattern data (the original read STMIK's channel state), so
  slides and vibrato do not move them. The progress bar and positions come from libopenmpt.

## Layout

| Path | Content |
|------|---------|
| `site/` | The web app (`js/menu.js`, `text.js`, `play.js`, `vga.js`, `tracker.js`, audio worklet), `writeup.html` |
| `tools/` | Emulator oracle, disassembler helper, DOSBox-X capture scripts, tests, `build.sh` |
| `docs/ANALYSIS.md` | Reverse-engineering notes |
| `work/` | Disassembly dumps and the unpacked v1.0 EXE |

## Credits and rights

All content belongs to its authors: MDP, Future Crew; music, Purple Motion and Skaven; sound engine STMIK, Sami
Tammilehto; libopenmpt, the OpenMPT project (see `site/vendor`). Preservation and educational port.
