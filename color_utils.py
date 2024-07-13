import numpy as np
from matplotlib.colors import rgb_to_hsv, hsv_to_rgb


def rgb_to_hsl(rgb_color):
    rgb_normalized = np.array(rgb_color) / 255.0
    hsv = rgb_to_hsv(rgb_normalized)
    hsl = np.zeros_like(hsv)
    hsl[0] = hsv[0] * 360  # Hue
    hsl[1] = hsv[1]  # Saturation
    hsl[2] = (2 - hsv[1]) * hsv[2] / 2  # Lightness
    return hsl


def hsl_to_rgb(h, s, l):
    c = (1 - abs(2 * l - 1)) * s
    x = c * (1 - abs((h / 60) % 2 - 1))
    m = l - c / 2
    if 0 <= h < 60:
        r, g, b = c, x, 0
    elif 60 <= h < 120:
        r, g, b = x, c, 0
    elif 120 <= h < 180:
        r, g, b = 0, c, x
    elif 180 <= h < 240:
        r, g, b = 0, x, c
    elif 240 <= h < 300:
        r, g, b = x, 0, c
    elif 300 <= h < 360:
        r, g, b = c, 0, x
    rgb = (r + m, g + m, b + m)
    return tuple(int(val * 255) for val in rgb)
