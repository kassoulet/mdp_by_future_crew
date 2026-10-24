# MDP — MusicDiscPlayer, JavaScript port (work in progress)

A pixel-exact browser recreation of **MDP.EXE**, the S3M/MOD player and music-disk engine by
**Future Crew** (1993), with audio by libopenmpt. One site, a menu at start to pick the disc:

| Disc | Player | Content |
|------|--------|---------|
| `journey1` | MDP v1.0 | Journey I, Purple Motion |
| `journey2` | MDP v1.0 | Journey II, Purple Motion |
| `chmind` | MDP v1.1 | Chaotic Mind, Skaven (adds `+`/`-` volume, `S` mono/stereo) |

The original files are kept untouched in their folders.

## Status

Analysis done, port not started. See [`docs/ANALYSIS.md`](docs/ANALYSIS.md).

Key finding: the original runs in VGA mode 12h (640x480, 16 colours, planar), so the port renders
a native 640x480 canvas (4:3, square pixels) by porting the original assembly graphics unit to a
4-plane framebuffer.

## Planned

- Faithful menu (MDP.MDI parser, smooth scroll) and playing screen.
- libopenmpt audio, hi-fi by default, optional old-school (low-rate, SB Pro-like) mode; pause and seek.
- Write-up of the reverse engineering and the best asm tricks.
- Static site on GitHub Pages.

## Layout

| Path | Content |
|------|---------|
| `journey1/`, `journey2/`, `chmind/` | Original disc files |
| `docs/` | Analysis notes |
| `tools/` | Disassembler helper, DOSBox-X capture script and config |
| `work/` | Reference frames (native 640x480) and disassembly dumps |

## Credits and rights

All content belongs to its authors: MDP, Future Crew; music, Purple Motion and Skaven;
sound engine STMIK, Sami Tammilehto. Preservation and educational port.
