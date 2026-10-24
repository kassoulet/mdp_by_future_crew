import sys
from capstone import *
d=open(sys.argv[1],'rb').read(); img=d[0x600:]
seg=int(sys.argv[2],16); a=int(sys.argv[3],16); n=int(sys.argv[4],16)
base=seg*16
for i in Cs(CS_ARCH_X86,CS_MODE_16).disasm(img[base+a:base+a+n],a): print(f'{seg:x}:{i.address:04x} {i.mnemonic} {i.op_str}')
