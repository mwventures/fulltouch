#!/usr/bin/env python3
"""Generate FullTouch's PNG icons with no third-party dependencies.

The mark: a cyan rounded square with a white pill (the nav bar) near the top
and a white downward arrow below it (swipe down to reveal). Rendered at 4x and
box-downsampled for anti-aliasing.

Usage:  python scripts/gen_icons.py
Outputs icons/icon{16,32,48,128}.png
"""

import math
import os
import struct
import zlib

SS = 4  # supersampling factor

BG = (0, 188, 212)       # cyan (#00bcd4)
BG2 = (0, 151, 167)      # deeper cyan (#0097a7) for a subtle vertical gradient
FG = (255, 255, 255)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def rounded_rect(x, y, x0, y0, x1, y1, r):
    """True if point (x, y) is inside a rounded rectangle."""
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    # corner regions
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def in_triangle(px, py, a, b, c):
    def sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
    d1 = sign((px, py), a, b)
    d2 = sign((px, py), b, c)
    d3 = sign((px, py), c, a)
    has_neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
    has_pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
    return not (has_neg and has_pos)


def render(size):
    S = size * SS
    px = bytearray(S * S * 4)  # straight RGBA

    pad = S * 0.06
    radius = S * 0.22

    # Nav-bar pill near the top.
    pill_y0, pill_y1 = S * 0.26, S * 0.40
    pill_x0, pill_x1 = S * 0.24, S * 0.76
    pill_r = (pill_y1 - pill_y0) / 2

    # Down arrow (stem + head) below the pill.
    stem_x0, stem_x1 = S * 0.45, S * 0.55
    stem_y0, stem_y1 = S * 0.50, S * 0.66
    head = (
        (S * 0.34, S * 0.62),  # left
        (S * 0.66, S * 0.62),  # right
        (S * 0.50, S * 0.80),  # tip (bottom)
    )

    for y in range(S):
        for x in range(S):
            i = (y * S + x) * 4
            if not rounded_rect(x + 0.5, y + 0.5, pad, pad, S - pad, S - pad, radius):
                continue  # leave transparent
            bg = lerp(BG, BG2, (y / S))
            r, g, b = bg
            xf, yf = x + 0.5, y + 0.5
            on_fg = (
                rounded_rect(xf, yf, pill_x0, pill_y0, pill_x1, pill_y1, pill_r)
                or (stem_x0 <= xf <= stem_x1 and stem_y0 <= yf <= stem_y1)
                or in_triangle(xf, yf, *head)
            )
            if on_fg:
                r, g, b = FG
            px[i:i + 4] = bytes((r, g, b, 255))

    return downsample(px, S, size)


def downsample(px, S, size):
    """Box-downsample S x S straight-RGBA to size x size, premultiplied so edges
    don't darken against transparency."""
    out = bytearray(size * size * 4)
    n = SS * SS
    for oy in range(size):
        for ox in range(size):
            ar = ag = ab = aa = 0
            for dy in range(SS):
                for dx in range(SS):
                    sx = ox * SS + dx
                    sy = oy * SS + dy
                    i = (sy * S + sx) * 4
                    a = px[i + 3]
                    ar += px[i] * a
                    ag += px[i + 1] * a
                    ab += px[i + 2] * a
                    aa += a
            j = (oy * size + ox) * 4
            if aa == 0:
                out[j:j + 4] = b"\x00\x00\x00\x00"
            else:
                out[j] = round(ar / aa)
                out[j + 1] = round(ag / aa)
                out[j + 2] = round(ab / aa)
                out[j + 3] = round(aa / n)
    return out


def write_png(path, size, rgba):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(
            ">I", zlib.crc32(tag + data) & 0xFFFFFFFF
        )

    stride = size * 4
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type 0 (none)
        raw += rgba[y * stride:(y + 1) * stride]
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
        f.write(chunk(b"IEND", b""))


def main():
    out_dir = os.path.join(os.path.dirname(__file__), "..", "icons")
    os.makedirs(out_dir, exist_ok=True)
    for size in (16, 32, 48, 128):
        rgba = render(size)
        path = os.path.join(out_dir, f"icon{size}.png")
        write_png(path, size, rgba)
        print("wrote", os.path.normpath(path))


if __name__ == "__main__":
    main()
