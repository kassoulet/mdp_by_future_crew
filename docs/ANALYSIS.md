# MDP analysis (work in progress)

## What is in mdp/
- `journey1`, `journey2`: same `MDP.EXE` v1.0 (LZEXE 0.91, md5 5abb86fd…), different `MDP.MDI`/modules.
- `chmind`: `MDP.EXE` v1.1 (other packer; adds `+`/`-` volume and `S` mono/stereo).
- Unpack v1.0 with unlzexe (`unlzexe.c`, mywave82 fork); the unpacked image is 0x129A7 bytes.

## Program
- Turbo Pascal 6/7 program; sound = STMIK 0.9 (SB, SB Pro, GUS drivers).
- **Video: BIOS mode 12h, 640x480, 16 colours planar, square pixels.** Not mode X / 320x240.
  - Smooth scroll with CRTC start address + line compare (0x3D4 regs 0Ch/0Dh/18h/07h/09h).
  - Palette is faded via DAC (3C8/3C9) from a 16x3 table; ~9-12 colours used per screen.
- Graphics/text unit = code segment `0x314` (image offset `0x3140`), written in assembly.
  - Far-call API: `4364` set pitch, `4382` set x,y, `439d` pick font, `43c1` set colour,
    `43d6` draw string (FS:BX, 0-terminated), `43ee` draw justified string, `4e1c`.
  - Font header: `+0` height, `+2` first char, `+4` last char, `+6` default advance,
    `+8+4*i` = (bitmap offset, advance). Bitmap = one 16-bit word per row, bit 15 = left.
  - Fonts at `0x28ac` (small) and `0x369c` (big) in that segment. Big 'G' is at file offset 0x66f8.
  - Colours are bit planes: glyph drawn by AND-clearing plane `c`, then a drop shadow is OR-ed into plane 3 (+2px, +1 row).
- Data segment DS = 0x11fb; stack segment after the image.

## Reference captures
`tools/capture.sh` runs DOSBox-X (extracted from the Ubuntu .deb, no root) on Xvfb and crops the
640x480 window at +192+144. Files in `work/ref_*.png` are exact native frames.

## Plan
1. JS planar framebuffer (4 bit planes) + 1:1 port of the 0x314 unit, diff against captures.
2. Port menu (MDI parser, scroll) and play screen (header, progress bar, channel grid).
3. Audio: libopenmpt worklet (hi-fi) + "old-school" mode; pause + seek.
4. Site: launcher menu (Journey I / II / Chaotic Mind), write-up, GitHub Pages deploy.

## Update: what the screens turned out to be
- Menu: unit 0x314, entry 4e1c. 512x1024 virtual screen, CRTC scroll + line compare, text via the shared glyph engine.
- Playing screen: header and bar in the main program (0:2246, 0:20ba); markers in unit 0xf4e (init 0x78, per frame 0xa6a).
  38 columns indexed by (instrument-1) mod 38, y from the channel period, size from volume, decay one step per frame.
- Pitch input of the marker quantiser is 16 x the ST3 period (C-4 at 8363 Hz = 27392).
- Ports verified: menu vs oracle (every frame), static play screen vs DOSBox-X (header/grid exact).
