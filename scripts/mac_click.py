import ctypes
import time
import sys

core_graphics = ctypes.cdll.LoadLibrary('/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices')

class CGPoint(ctypes.Structure):
    _fields_ = [("x", ctypes.c_double), ("y", ctypes.c_double)]

core_graphics.CGEventCreateMouseEvent.restype = ctypes.c_void_p
core_graphics.CGEventCreateMouseEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint32, CGPoint, ctypes.c_uint32]
core_graphics.CGEventPost.restype = None
core_graphics.CGEventPost.argtypes = [ctypes.c_uint32, ctypes.c_void_p]

def click(x, y):
    pt = CGPoint(x, y)
    down = core_graphics.CGEventCreateMouseEvent(None, 1, pt, 0)
    up = core_graphics.CGEventCreateMouseEvent(None, 2, pt, 0)
    core_graphics.CGEventPost(0, down)
    time.sleep(0.08)
    core_graphics.CGEventPost(0, up)

if __name__ == '__main__':
    if len(sys.argv) >= 3:
        click(float(sys.argv[1]), float(sys.argv[2]))
        print(f"Clicked at ({sys.argv[1]}, {sys.argv[2]})")
