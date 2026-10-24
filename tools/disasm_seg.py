"""usage: disasm_seg.py unpacked.exe SEG(hex) OFF(hex) LEN(hex)  -- real-mode disassembly, skips undecodable bytes"""
import sys
from capstone import *
d = open(sys.argv[1], 'rb').read(); img = d[0x600:]
seg, a, n = (int(x, 16) for x in sys.argv[2:5]); base = seg * 16
md = Cs(CS_ARCH_X86, CS_MODE_16); end = a + n
while a < end:
    got = False
    for i in md.disasm(img[base+a:base+end], a):
        print(f'{seg:x}:{i.address:04x} {i.bytes.hex():16s} {i.mnemonic} {i.op_str}'); a = i.address + i.size; got = True
    if a < end and not got or a < end:
        print(f'{seg:x}:{a:04x} {img[base+a]:02x}               db'); a += 1
