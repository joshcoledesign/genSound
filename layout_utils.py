# layout_utils.py

import numpy as np

LAYOUTS = ['rows', 'serpentine', 'spiral', 'rings', 'hilbert']

def layout_positions(layout, cols, rows):
    # Return the (col, row) of each square in time order
    if layout == 'rows':
        return [(i % cols, i // cols) for i in range(cols * rows)]
    if layout == 'serpentine':
        return [(c if r % 2 == 0 else cols - 1 - c, r) for r in range(rows) for c in range(cols)]
    if layout == 'spiral':
        return square_spiral(cols, rows)
    if layout == 'rings':
        return rings(cols, rows)
    if layout == 'hilbert':
        return list(gilbert2d(cols, rows))
    raise ValueError(f'unknown layout: {layout}')

def square_spiral(cols, rows):
    # Walk outward from the center: right 1, down 1, left 2, up 2, right 3, ...
    # skipping steps that fall outside the grid (on a non-square grid this
    # makes jumps once the spiral is wider than the short side)
    c, r = (cols - 1) // 2, (rows - 1) // 2
    positions = [(c, r)]
    directions = [(1, 0), (0, 1), (-1, 0), (0, -1)]
    step, turn = 1, 0
    while len(positions) < cols * rows:
        for _ in range(2):
            dc, dr = directions[turn % 4]
            for _ in range(step):
                c, r = c + dc, r + dr
                if 0 <= c < cols and 0 <= r < rows:
                    positions.append((c, r))
            turn += 1
        step += 1
    return positions

def rings(cols, rows):
    # Concentric rings from the center outward, each ring swept by angle
    c, r = np.meshgrid(np.arange(cols), np.arange(rows))
    dc, dr = c - (cols - 1) / 2, r - (rows - 1) / 2
    ring = np.floor(np.hypot(dc, dr)).ravel()
    angle = np.arctan2(dr, dc).ravel()
    order = np.lexsort((angle, ring))
    return list(zip(c.ravel()[order].tolist(), r.ravel()[order].tolist()))

def gilbert2d(width, height):
    # Generalized Hilbert curve for any rectangle, adapted from gilbert
    # (https://github.com/jakubcerveny/gilbert), Copyright (c) 2018 Jakub Červený,
    # BSD 2-Clause License; see THIRD_PARTY_NOTICES.md.
    # each step moves to a neighboring square, so moments close in time stay close on the canvas
    if width >= height:
        yield from _gilbert(0, 0, width, 0, 0, height)
    else:
        yield from _gilbert(0, 0, 0, height, width, 0)

def _sign(x):
    return (x > 0) - (x < 0)

def _gilbert(x, y, ax, ay, bx, by):
    w, h = abs(ax + ay), abs(bx + by)
    dax, day = _sign(ax), _sign(ay)
    dbx, dby = _sign(bx), _sign(by)

    if h == 1:
        for _ in range(w):
            yield (x, y)
            x, y = x + dax, y + day
        return
    if w == 1:
        for _ in range(h):
            yield (x, y)
            x, y = x + dbx, y + dby
        return

    ax2, ay2 = ax // 2, ay // 2
    bx2, by2 = bx // 2, by // 2
    w2, h2 = abs(ax2 + ay2), abs(bx2 + by2)

    if 2 * w > 3 * h:
        if w2 % 2 and w > 2:
            ax2, ay2 = ax2 + dax, ay2 + day
        yield from _gilbert(x, y, ax2, ay2, bx, by)
        yield from _gilbert(x + ax2, y + ay2, ax - ax2, ay - ay2, bx, by)
    else:
        if h2 % 2 and h > 2:
            bx2, by2 = bx2 + dbx, by2 + dby
        yield from _gilbert(x, y, bx2, by2, ax2, ay2)
        yield from _gilbert(x + bx2, y + by2, ax, ay, bx - bx2, by - by2)
        yield from _gilbert(x + (ax - dax) + (bx2 - dbx), y + (ay - day) + (by2 - dby),
                            -bx2, -by2, -(ax - ax2), -(ay - ay2))
